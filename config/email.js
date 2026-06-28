const nodemailer = require('nodemailer');

const getTransporter = () => {
  const port = parseInt(process.env.EMAIL_PORT) || 587;
  const secure = process.env.EMAIL_SECURE === 'true' || port === 465;

  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp-relay.brevo.com',
    port,
    secure,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 30000,
    tls: {
      rejectUnauthorized: false,
    },
  });
};

const sendEmail = async ({ to, subject, html, text }) => {
  const transport = getTransporter();
  const mailOptions = {
    from: process.env.EMAIL_FROM || `Queuely <noreply@queuely.app>`,
    to,
    subject,
    html,
    text,
  };
  const info = await transport.sendMail(mailOptions);
  console.log(`[Email] Sent to ${to}: ${info.messageId}`);
  return info;
};

module.exports = { sendEmail };