const RESEND_API_URL = 'https://api.resend.com/emails';

const sendEmail = async ({ to, subject, html, text }) => {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('RESEND_API_KEY is not set');

  const payload = {
    from: 'Queuely <onboarding@resend.dev>',
    to: [to],
    subject,
    html,
  };
  if (text) payload.text = text;

  const response = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(`Resend API error (${response.status}): ${JSON.stringify(data)}`);
  }

  console.log(`[Email] Sent to ${to}: ${data.id || 'ok'}`);
  return data;
};

module.exports = { sendEmail };