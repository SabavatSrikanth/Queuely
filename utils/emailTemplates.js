const APP_NAME = process.env.APP_NAME || 'Queuely';
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:3000';

const baseStyle = `
  body { font-family: 'Segoe UI', Arial, sans-serif; background:#f0f2f5; margin:0; padding:0; }
  .wrapper { max-width:600px; margin:32px auto; background:#fff; border-radius:16px; overflow:hidden; box-shadow:0 4px 24px rgba(0,0,0,0.08); }
  .header { background:linear-gradient(135deg,#6c63ff,#4f46e5); padding:32px; text-align:center; }
  .header h1 { color:#fff; margin:0; font-size:28px; letter-spacing:-0.5px; }
  .header p { color:rgba(255,255,255,0.8); margin:8px 0 0; font-size:14px; }
  .body { padding:32px; }
  .body p { color:#444; line-height:1.7; font-size:15px; margin:0 0 16px; }
  .ticket-box { background:#f8f7ff; border:2px dashed #6c63ff; border-radius:12px; padding:24px; text-align:center; margin:24px 0; }
  .ticket-number { font-size:36px; font-weight:700; color:#4f46e5; letter-spacing:2px; }
  .ticket-label { font-size:12px; color:#888; text-transform:uppercase; letter-spacing:1px; margin-bottom:8px; }
  .info-row { display:flex; justify-content:space-between; background:#f8f7ff; border-radius:8px; padding:12px 16px; margin:8px 0; font-size:14px; }
  .info-label { color:#888; }
  .info-value { color:#333; font-weight:600; }
  .btn { display:inline-block; background:linear-gradient(135deg,#6c63ff,#4f46e5); color:#fff; text-decoration:none; padding:14px 32px; border-radius:50px; font-weight:600; font-size:15px; margin:16px 0; }
  .footer { background:#f8f7ff; padding:20px 32px; text-align:center; font-size:12px; color:#aaa; }
  .footer a { color:#6c63ff; text-decoration:none; }
  .status-badge { display:inline-block; padding:4px 12px; border-radius:50px; font-size:12px; font-weight:600; text-transform:uppercase; }
  .status-called { background:#fef3c7; color:#d97706; }
  .status-serving { background:#d1fae5; color:#059669; }
  .divider { border:none; border-top:1px solid #f0f0f0; margin:24px 0; }
`;

const emailTemplates = {

  verifyEmail: ({ name, verifyUrl }) => ({
    subject: `Verify your Queuely account`,
    html: `<!DOCTYPE html><html><head><style>${baseStyle}</style></head><body>
      <div class="wrapper">
        <div class="header"><h1>📬 ${APP_NAME}</h1><p>Verify your email to get started</p></div>
        <div class="body">
          <p>Hi <strong>${name}</strong>,</p>
          <p>Thanks for signing up! Please verify your email address to activate your account.</p>
          <div style="text-align:center">
            <a href="${verifyUrl}" class="btn">Verify Email Address</a>
          </div>
          <p style="font-size:13px;color:#aaa">This link expires in <strong>24 hours</strong>. If you didn't create an account, you can safely ignore this email.</p>
        </div>
        <div class="footer"><p>© ${new Date().getFullYear()} ${APP_NAME} · <a href="${CLIENT_URL}">Visit Website</a></p></div>
      </div>
    </body></html>`,
  }),

  /**
   * Password Reset
   */
  passwordReset: ({ name, resetUrl }) => ({
    subject: `Reset your Queuely password`,
    html: `<!DOCTYPE html><html><head><style>${baseStyle}</style></head><body>
      <div class="wrapper">
        <div class="header"><h1>🔐 ${APP_NAME}</h1><p>Password Reset Request</p></div>
        <div class="body">
          <p>Hi <strong>${name}</strong>,</p>
          <p>We received a request to reset your password. Click the button below to set a new password.</p>
          <div style="text-align:center">
            <a href="${resetUrl}" class="btn">Reset Password</a>
          </div>
          <p style="font-size:13px;color:#aaa">This link expires in <strong>1 hour</strong>. If you didn't request a password reset, ignore this email — your account is safe.</p>
        </div>
        <div class="footer"><p>© ${new Date().getFullYear()} ${APP_NAME}</p></div>
      </div>
    </body></html>`,
  }),

  /**
   * Queue Joined Confirmation
   */
  queueJoined: ({ name, ticketNumber, serviceName, businessName, position, estimatedWait, ticketUrl }) => ({
    subject: `You're in the queue! Ticket ${ticketNumber} — ${businessName}`,
    html: `<!DOCTYPE html><html><head><style>${baseStyle}</style></head><body>
      <div class="wrapper">
        <div class="header"><h1>🎫 ${APP_NAME}</h1><p>You've joined the queue</p></div>
        <div class="body">
          <p>Hi <strong>${name}</strong>,</p>
          <p>You're now in queue at <strong>${businessName}</strong> for <strong>${serviceName}</strong>.</p>
          <div class="ticket-box">
            <div class="ticket-label">Your Ticket Number</div>
            <div class="ticket-number">${ticketNumber}</div>
          </div>
          <div class="info-row"><span class="info-label">Position</span><span class="info-value">#${position}</span></div>
          <div class="info-row"><span class="info-label">Est. Wait Time</span><span class="info-value">${estimatedWait} mins</span></div>
          <div class="info-row"><span class="info-label">Service</span><span class="info-value">${serviceName}</span></div>
          <div style="text-align:center;margin-top:24px">
            <a href="${ticketUrl}" class="btn">Track Your Position Live</a>
          </div>
          <p style="font-size:13px;color:#aaa">We'll email you when you're called. You can also scan your ticket QR code to check status anytime.</p>
        </div>
        <div class="footer"><p>© ${new Date().getFullYear()} ${APP_NAME}</p></div>
      </div>
    </body></html>`,
  }),

  /**
   * Ticket Called (You're Next!)
   */
  ticketCalled: ({ name, ticketNumber, serviceName, businessName, ticketUrl }) => ({
    subject: `🔔 You're being called! Ticket ${ticketNumber}`,
    html: `<!DOCTYPE html><html><head><style>${baseStyle}</style></head><body>
      <div class="wrapper">
        <div class="header" style="background:linear-gradient(135deg,#f59e0b,#d97706)">
          <h1>🔔 ${APP_NAME}</h1><p>It's your turn!</p>
        </div>
        <div class="body">
          <p>Hi <strong>${name}</strong>,</p>
          <p>Your ticket has been called at <strong>${businessName}</strong> for <strong>${serviceName}</strong>. Please proceed to the counter now.</p>
          <div class="ticket-box">
            <div class="ticket-label">Your Ticket</div>
            <div class="ticket-number">${ticketNumber}</div>
            <span class="status-badge status-called">Called</span>
          </div>
          <div style="text-align:center">
            <a href="${ticketUrl}" class="btn">View Ticket Status</a>
          </div>
        </div>
        <div class="footer"><p>© ${new Date().getFullYear()} ${APP_NAME}</p></div>
      </div>
    </body></html>`,
  }),

  /**
   * Appointment Confirmation
   */
  appointmentConfirmed: ({ name, businessName, serviceName, date, startTime, endTime, appointmentId }) => ({
    subject: `Appointment confirmed — ${businessName}`,
    html: `<!DOCTYPE html><html><head><style>${baseStyle}</style></head><body>
      <div class="wrapper">
        <div class="header"><h1>📅 ${APP_NAME}</h1><p>Appointment Confirmed</p></div>
        <div class="body">
          <p>Hi <strong>${name}</strong>,</p>
          <p>Your appointment at <strong>${businessName}</strong> is confirmed.</p>
          <div class="info-row"><span class="info-label">Service</span><span class="info-value">${serviceName}</span></div>
          <div class="info-row"><span class="info-label">Date</span><span class="info-value">${date}</span></div>
          <div class="info-row"><span class="info-label">Time</span><span class="info-value">${startTime} – ${endTime}</span></div>
          <hr class="divider">
          <p style="font-size:13px;color:#aaa">You'll receive a reminder 24 hours before your appointment. To cancel or reschedule, visit your appointments page.</p>
        </div>
        <div class="footer"><p>© ${new Date().getFullYear()} ${APP_NAME}</p></div>
      </div>
    </body></html>`,
  }),

  /**
   * Appointment Reminder
   */
  appointmentReminder: ({ name, businessName, serviceName, date, startTime, hoursAhead }) => ({
    subject: `Reminder: Appointment in ${hoursAhead}h — ${businessName}`,
    html: `<!DOCTYPE html><html><head><style>${baseStyle}</style></head><body>
      <div class="wrapper">
        <div class="header" style="background:linear-gradient(135deg,#10b981,#059669)">
          <h1>⏰ ${APP_NAME}</h1><p>Appointment Reminder</p>
        </div>
        <div class="body">
          <p>Hi <strong>${name}</strong>,</p>
          <p>This is a reminder that your appointment is in <strong>${hoursAhead} hours</strong>.</p>
          <div class="info-row"><span class="info-label">Business</span><span class="info-value">${businessName}</span></div>
          <div class="info-row"><span class="info-label">Service</span><span class="info-value">${serviceName}</span></div>
          <div class="info-row"><span class="info-label">Date</span><span class="info-value">${date}</span></div>
          <div class="info-row"><span class="info-label">Time</span><span class="info-value">${startTime}</span></div>
        </div>
        <div class="footer"><p>© ${new Date().getFullYear()} ${APP_NAME}</p></div>
      </div>
    </body></html>`,
  }),

  /**
   * Staff Invitation
   */
  staffInvite: ({ inviterName, businessName, acceptUrl }) => ({
    subject: `You've been invited to join ${businessName} on ${APP_NAME}`,
    html: `<!DOCTYPE html><html><head><style>${baseStyle}</style></head><body>
      <div class="wrapper">
        <div class="header"><h1>👥 ${APP_NAME}</h1><p>Staff Invitation</p></div>
        <div class="body">
          <p><strong>${inviterName}</strong> has invited you to join <strong>${businessName}</strong> as a staff member on ${APP_NAME}.</p>
          <div style="text-align:center">
            <a href="${acceptUrl}" class="btn">Accept Invitation</a>
          </div>
          <p style="font-size:13px;color:#aaa">This invitation expires in 48 hours.</p>
        </div>
        <div class="footer"><p>© ${new Date().getFullYear()} ${APP_NAME}</p></div>
      </div>
    </body></html>`,
  }),
};

module.exports = emailTemplates;