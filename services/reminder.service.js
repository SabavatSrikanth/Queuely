/**
 * @file services/reminder.service.js
 * @description Appointment reminder job — runs every hour and sends email
 * reminders to customers whose appointments are coming up in the next 24 hours.
 */

const cron = require('node-cron');
const Appointment = require('../models/Appointment');
const emailTemplates = require('../utils/emailTemplates');
const { sendEmail } = require('../config/email');

/**
 * Send reminder emails for appointments happening in the next ~1 hour window.
 * The job runs every hour, so we check for appointments starting between
 * 23h and 25h from now (to catch the 24-hour mark reliably).
 */
const sendReminders = async () => {
  try {
    const now = new Date();
    const windowStart = new Date(now.getTime() + 23 * 60 * 60 * 1000);
    const windowEnd = new Date(now.getTime() + 25 * 60 * 60 * 1000);

    const appointments = await Appointment.find({
      status: { $in: ['scheduled', 'confirmed'] },
      appointmentDate: {
        $gte: windowStart,
        $lte: windowEnd,
      },
      reminderSent: { $ne: true },
    })
      .populate('customer', 'name email')
      .populate('business', 'name')
      .populate('service', 'name');

    if (appointments.length === 0) {
      console.log('[Reminder] No upcoming appointments to remind.');
      return;
    }

    console.log(`[Reminder] Sending reminders for ${appointments.length} appointments...`);

    for (const appt of appointments) {
      try {
        const recipientEmail = appt.customer
          ? appt.customer.email
          : appt.guestInfo && appt.guestInfo.email
          ? appt.guestInfo.email
          : null;

        const recipientName = appt.customer
          ? appt.customer.name
          : appt.guestInfo && appt.guestInfo.name
          ? appt.guestInfo.name
          : 'Valued Customer';

        if (!recipientEmail) {
          console.log(`[Reminder] Skipping appointment ${appt._id} — no email on file`);
          continue;
        }

        const content = emailTemplates.appointmentReminder({
          name: recipientName,
          businessName: appt.business ? appt.business.name : 'the business',
          serviceName: appt.service ? appt.service.name : 'your service',
          date: new Date(appt.appointmentDate).toLocaleDateString('en-IN', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
          }),
          startTime: appt.startTime,
          hoursAhead: 24,
        });

        await sendEmail({ to: recipientEmail, subject: content.subject, html: content.html });

        // Mark reminder as sent so we don't send it again
        await Appointment.findByIdAndUpdate(appt._id, { reminderSent: true });

        console.log(`[Reminder] Sent to ${recipientEmail} for appointment ${appt._id}`);
      } catch (err) {
        console.error(`[Reminder] Failed for appointment ${appt._id}:`, err.message);
      }
    }
  } catch (err) {
    console.error('[Reminder] Job error:', err.message);
  }
};

/**
 * Start the reminder cron job.
 * Runs every hour at minute 0.
 */
const startReminderJob = () => {
  console.log('[Reminder] Appointment reminder job scheduled (runs every hour)');
  cron.schedule('0 * * * *', sendReminders);
};

module.exports = { startReminderJob, sendReminders };