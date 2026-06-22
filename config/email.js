const nodemailer = require('nodemailer');

let transporter;

const getTransporter = () => {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.EMAIL_PORT) || 587,
      secure: parseInt(process.env.EMAIL_PORT) === 465,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });
  }
  return transporter;
};

/**
 * Send an email
 * @param {object} options - { to, subject, html, text }
 */
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
