const nodemailer = require('nodemailer');

let transporter;

const getTransporter = () => {
  if (!transporter) {
    const port = parseInt(process.env.EMAIL_PORT) || 465;
    const secure = process.env.EMAIL_SECURE === 'true' || port === 465;

    transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST || 'smtp.gmail.com',
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
        rejectUnauthorized: true,
      },
    });
  }
  return transporter;
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