const nodemailer = require('nodemailer');

let transporterPromise;

async function createTransporter() {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    return nodemailer.createTransport({
      jsonTransport: true,
    });
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: {
      user,
      pass,
    },
  });
}

async function getTransporter() {
  if (!transporterPromise) {
    transporterPromise = createTransporter().catch((error) => {
      transporterPromise = null;
      throw error;
    });
  }

  return transporterPromise;
}

async function sendVerificationEmail({ email, code, expiresInMinutes }) {
  const transporter = await getTransporter();
  const from =
    process.env.MAIL_FROM ||
    process.env.SMTP_USER ||
    'no-reply@example.com';

  const result = await transporter.sendMail({
    from,
    to: email,
    subject: 'קוד אימות לתור שלך',
    text: [
      'שלום,',
      '',
      `קוד האימות שלך הוא: ${code}`,
      `הקוד תקף ל-${expiresInMinutes} דקות.`,
      '',
      'אם לא ביקשת לקבוע תור, אפשר להתעלם מהמייל הזה.',
    ].join('\n'),
    html: `
      <div dir="rtl" style="font-family: Arial, sans-serif; line-height: 1.6;">
        <h2>קוד אימות לתור שלך</h2>
        <p>קוד האימות שלך הוא:</p>
        <p style="font-size: 28px; font-weight: 700; letter-spacing: 4px;">${code}</p>
        <p>הקוד תקף ל-${expiresInMinutes} דקות.</p>
        <p>אם לא ביקשת לקבוע תור, אפשר להתעלם מהמייל הזה.</p>
      </div>
    `,
  });

  if (result.message) {
    console.log('Verification email preview:', result.message.toString());
  }

  return result;
}

module.exports = {
  sendVerificationEmail,
};
