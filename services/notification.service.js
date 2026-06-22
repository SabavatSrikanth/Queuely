const Notification = require('../models/Notification');
const User = require('../models/User');
const { sendEmail: sendEmailViaSmtp } = require('../config/email');
const emailTemplates = require('../utils/emailTemplates');
let socketConfig;
try {
  socketConfig = require('../config/socket');
} catch (e) {
  socketConfig = null;
}

/**
 * Maps a Notification.type value to the matching emailTemplates entry and
 * the data it needs. Returns null if no dedicated template exists for that
 * type, in which case a generic fallback email is sent instead.
 */
const buildEmailContent = (notification, recipientUser) => {
  const name = recipientUser ? recipientUser.name : (notification.data && notification.data.guestName) || 'there';
  const ticketUrl = notification.data && notification.data.ticketUrl;

  switch (notification.type) {
    case 'queue_joined':
      if (notification.data && notification.data.ticketNumber) {
        return emailTemplates.queueJoined({
          name,
          ticketNumber: notification.data.ticketNumber,
          serviceName: notification.data.serviceName || '',
          businessName: notification.data.businessName || '',
          position: notification.data.position || '',
          estimatedWait: notification.data.estimatedWait || '',
          ticketUrl: ticketUrl || '#',
        });
      }
      break;
    case 'called':
      if (notification.data && notification.data.ticketNumber) {
        return emailTemplates.ticketCalled({
          name,
          ticketNumber: notification.data.ticketNumber,
          serviceName: notification.data.serviceName || '',
          businessName: notification.data.businessName || '',
          ticketUrl: ticketUrl || '#',
        });
      }
      break;
    case 'appointment_confirmed':
      if (notification.data) {
        return emailTemplates.appointmentConfirmed({
          name,
          businessName: notification.data.businessName || '',
          serviceName: notification.data.serviceName || '',
          date: notification.data.date || '',
          startTime: notification.data.startTime || '',
          endTime: notification.data.endTime || '',
          appointmentId: notification.data.appointmentId || '',
        });
      }
      break;
    case 'appointment_reminder':
      if (notification.data) {
        return emailTemplates.appointmentReminder({
          name,
          businessName: notification.data.businessName || '',
          serviceName: notification.data.serviceName || '',
          date: notification.data.date || '',
          startTime: notification.data.startTime || '',
          hoursAhead: notification.data.hoursAhead || 24,
        });
      }
      break;
    default:
      break;
  }

  // Generic fallback — covers position_update, serving_now, appointment_cancelled,
  // ticket_cancelled, staff_invite (without inviter context), review_request,
  // system_alert, and any future type without a dedicated branded template.
  return {
    subject: notification.title || 'Queuely Notification',
    html: `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;color:#333;padding:24px;">
      <h2 style="color:#4f46e5;">${notification.title || 'Queuely Notification'}</h2>
      <p>${notification.body || ''}</p>
    </body></html>`,
    text: notification.body || notification.title || '',
  };
};

class NotificationService {
  /**
   * Send a notification. Creates a Notification document and dispatches it
   * across the requested channels. Previously this was a no-op stub that
   * marked everything "sent"/"delivered" without ever actually emailing,
   * texting, or socket-pushing anyone, and was never even called from any
   * controller/service (Audit H4) — both gaps are fixed here.
   *
   * @param {Object} data
   * @param {String|ObjectId} [data.recipient] - User ID, or null/undefined for guests
   * @param {String} [data.guestEmail]
   * @param {String} [data.guestPhone]
   * @param {String} data.type - Notification type (see Notification model enum)
   * @param {Array<String>} [data.channels] - subset of ['email','inApp','sms']; defaults to ['inApp']
   * @param {String} data.title
   * @param {String} data.body
   * @param {Object} [data.data] - extra structured payload (also used to render email templates)
   */
  static async send(data) {
    const {
      recipient, guestEmail, guestPhone, type, title, body,
    } = data;
    const channels = data.channels && data.channels.length ? data.channels : ['inApp'];

    let recipientUser = null;
    if (recipient) {
      try {
        recipientUser = await User.findById(recipient);
      } catch (err) {
        recipientUser = null;
      }
    }

    // Respect the recipient's own notification channel preferences when we
    // have a registered user; guests have no preferences to honor.
    const allowedChannels = channels.filter((c) => {
      if (!recipientUser) return true;
      if (c === 'email') return recipientUser.notificationPreferences.email !== false;
      if (c === 'sms') return recipientUser.notificationPreferences.sms !== false;
      if (c === 'inApp') return recipientUser.notificationPreferences.inApp !== false;
      return true;
    });

    const wantsEmail = allowedChannels.includes('email') && (recipientUser ? recipientUser.email : guestEmail);
    const wantsInApp = allowedChannels.includes('inApp') && !!recipient;
    const wantsSms = allowedChannels.includes('sms') && (recipientUser ? recipientUser.phone : guestPhone);

    const deliveryStatus = {
      email: wantsEmail ? 'pending' : 'skipped',
      inApp: wantsInApp ? 'pending' : 'skipped',
      sms: wantsSms ? 'pending' : 'skipped',
    };

    const notification = await Notification.create({
      recipient: recipient || null,
      guestEmail,
      guestPhone,
      type,
      channels: allowedChannels,
      title,
      body,
      data: data.data,
      deliveryStatus,
    });

    // Fire-and-forget dispatch — failures are caught and recorded per-channel
    // so one failing channel never blocks the others or the calling flow.
    if (wantsEmail) this.sendEmail(notification, recipientUser).catch(() => {});
    if (wantsInApp) this.sendInApp(notification).catch(() => {});
    if (wantsSms) this.sendSms(notification, recipientUser).catch(() => {});

    return notification;
  }

  static async sendEmail(notification, recipientUser) {
    const to = (recipientUser && recipientUser.email) || notification.guestEmail;
    if (!to) {
      notification.deliveryStatus.email = 'skipped';
      return notification.save();
    }

    try {
      const content = buildEmailContent(notification, recipientUser);
      await sendEmailViaSmtp({ to, subject: content.subject, html: content.html, text: content.text });
      notification.deliveryStatus.email = 'sent';
    } catch (err) {
      console.error('[NotificationService] Email delivery failed:', err.message);
      notification.deliveryStatus.email = 'failed';
    }
    await notification.save();
  }

  static async sendInApp(notification) {
    if (!notification.recipient) {
      notification.deliveryStatus.inApp = 'skipped';
      return notification.save();
    }

    try {
      if (socketConfig) {
        socketConfig.emitUserNotification(notification.recipient, notification);
        const unreadCount = await Notification.countDocuments({
          recipient: notification.recipient,
          readAt: null,
        });
        socketConfig.emitNotificationCount(notification.recipient, unreadCount);
      }
      notification.deliveryStatus.inApp = 'delivered';
    } catch (err) {
      console.error('[NotificationService] In-app delivery failed:', err.message);
      // inApp delivery failing (e.g. socket not initialized) shouldn't be
      // treated as a hard failure — the notification still exists in the
      // user's notification list for when they next open the app.
      notification.deliveryStatus.inApp = 'pending';
    }
    await notification.save();
  }

  /**
   * SMS remains a deliberately safe no-op unless explicitly enabled via
   * SMS_ENABLED=true with real Twilio credentials configured — there is no
   * verified Twilio account in this project, so silently pretending to send
   * SMS would be misleading. When disabled, it's recorded as 'skipped'
   * rather than falsely marked as 'sent'.
   */
  static async sendSms(notification, recipientUser) {
    const to = (recipientUser && recipientUser.phone) || notification.guestPhone;
    const enabled = process.env.SMS_ENABLED === 'true';

    if (!enabled || !to) {
      notification.deliveryStatus.sms = 'skipped';
      return notification.save();
    }

    if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_PHONE) {
      console.warn('[NotificationService] SMS_ENABLED=true but Twilio credentials are missing; skipping SMS.');
      notification.deliveryStatus.sms = 'skipped';
      return notification.save();
    }

    try {
      // twilio is an optional dependency — only required if SMS is actually
      // enabled. If it isn't installed (`npm install twilio`), we fail soft
      // rather than crashing the whole notification pipeline.
      let twilioClient;
      try {
        // eslint-disable-next-line global-require
        twilioClient = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
      } catch (requireErr) {
        console.warn('[NotificationService] SMS_ENABLED=true but the "twilio" package is not installed. Run `npm install twilio` to enable SMS.');
        notification.deliveryStatus.sms = 'skipped';
        await notification.save();
        return;
      }

      await twilioClient.messages.create({
        body: notification.body || notification.title,
        from: process.env.TWILIO_PHONE,
        to,
      });
      notification.deliveryStatus.sms = 'sent';
    } catch (err) {
      console.error('[NotificationService] SMS delivery failed:', err.message);
      notification.deliveryStatus.sms = 'failed';
    }
    await notification.save();
  }
}

module.exports = NotificationService;
