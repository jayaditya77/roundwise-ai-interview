import nodemailer from 'nodemailer';

let transporter;

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function getTransporter() {
  if (transporter) return transporter;
  if (!process.env.SMTP_HOST) return null;

  const port = Number(process.env.SMTP_PORT || 587);
  const auth = process.env.SMTP_USER
    ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD || '' }
    : undefined;

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: process.env.SMTP_SECURE === 'true' || port === 465,
    auth,
  });
  return transporter;
}

export async function sendAuthLink({ to, name, subject, heading, message, link, action }) {
  const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
  const url = `${frontendUrl}/#${new URLSearchParams({ [action]: link }).toString()}`;
  const mailer = getTransporter();

  if (!mailer) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Email delivery is not configured. Set SMTP_HOST and MAIL_FROM.');
    }
    console.info(`[development auth email] ${subject} for ${to}: ${url}`);
    return;
  }

  const from = process.env.MAIL_FROM || process.env.SMTP_USER;
  if (!from) throw new Error('Set MAIL_FROM when SMTP is configured.');

  const safeName = escapeHtml(name || 'there');
  const safeMessage = escapeHtml(message);
  const safeHeading = escapeHtml(heading);

  await mailer.sendMail({
    from,
    to,
    subject,
    text: `${heading}\n\nHi ${name || 'there'},\n${message}\n\n${url}\n\nIf you did not request this, you can ignore this email.`,
    html: `<div style="font-family:Arial,sans-serif;color:#202a25;max-width:520px;margin:32px auto;line-height:1.55"><h1 style="font-size:22px">${safeHeading}</h1><p>Hi ${safeName},</p><p>${safeMessage}</p><p><a href="${url}" style="display:inline-block;padding:11px 16px;background:#28674f;color:#fff;text-decoration:none;border-radius:5px">${escapeHtml(heading)}</a></p><p style="font-size:13px;color:#6b756f">If you did not request this, you can ignore this email.</p></div>`,
  });
}