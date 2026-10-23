// Envío de emails por SMTP (SMTP_URL). Sin SMTP los emails igual quedan registrados en el panel.
import { config } from './config.js';
let transport = null;
export async function sendEmail({ to, subject, html }) {
  if (!config.mail.smtpUrl) return 'sin-smtp';
  if (!transport) { const nodemailer = (await import('nodemailer')).default; transport = nodemailer.createTransport(config.mail.smtpUrl); }
  await transport.sendMail({ from: config.mail.from, to, subject, html });
  return 'ok';
}
