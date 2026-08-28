// lib/email/transport.ts
import 'server-only';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Mail delivery. One function per driver, selected by MAIL_DRIVER.
 *
 * Defaults to `log`, and that default is load-bearing: seed and staging
 * databases contain real customer addresses, so a developer running the
 * checkout flow must not be one missing env var away from emailing them.
 */

export interface Message {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
}

export type MailDriver = 'log' | 'smtp' | 'resend';

export function activeMailDriver(): MailDriver {
  const raw = process.env.MAIL_DRIVER;
  return raw === 'smtp' || raw === 'resend' ? raw : 'log';
}

function fromAddress(): string {
  const address = process.env.MAIL_FROM || 'no-reply@localhost';
  const name = process.env.MAIL_FROM_NAME;
  // Quote the display name — an unquoted comma or colon in a store name
  // produces a header the receiving server reads as two addresses.
  return name ? `"${name.replace(/"/g, '')}" <${address}>` : address;
}

/**
 * Writes the message to `.mail-outbox/` and prints a summary.
 *
 * The file matters more than the console line: HTML email is easy to get subtly
 * wrong, and being able to open the exact markup in a browser is the difference
 * between "it sent" and "it looks right".
 */
async function deliverToLog(message: Message): Promise<void> {
  const dir = path.resolve('.mail-outbox');
  await mkdir(dir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const safeTo = message.to.replace(/[^a-z0-9@._-]/gi, '_');
  const file = path.join(dir, `${stamp}__${safeTo}.html`);

  await writeFile(
    file,
    `<!-- To: ${message.to}\n     Subject: ${message.subject}\n     From: ${fromAddress()}\n` +
      `     Reply-To: ${message.replyTo ?? '(none)'} -->\n${message.html}`,
    'utf8'
  );

  console.log(
    `\n[mail:log] to=${message.to}  subject=${message.subject}\n` +
      `${message.text}\n[mail:log] html written to ${file}\n`
  );
}

async function deliverBySmtp(message: Message): Promise<void> {
  const nodemailer = (await import('nodemailer')).default;

  const port = Number(process.env.SMTP_PORT || 587);
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    // 465 is implicit TLS; 587 and 25 start plaintext and upgrade via STARTTLS.
    // Setting `secure: true` on 587 hangs until the socket times out.
    secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : port === 465,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
      : undefined,
  });

  await transporter.sendMail({
    from: fromAddress(),
    to: message.to,
    replyTo: message.replyTo,
    subject: message.subject,
    text: message.text,
    html: message.html,
  });
}

async function deliverByResend(message: Message): Promise<void> {
  // One POST — the SDK would be a dependency for a fetch call.
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: fromAddress(),
      to: [message.to],
      reply_to: message.replyTo,
      subject: message.subject,
      html: message.html,
      text: message.text,
    }),
  });

  if (!response.ok) {
    // Resend reports failures as a 4xx with a JSON body; surfacing it beats a
    // bare status code when the cause is usually an unverified sending domain.
    throw new Error(`Resend responded ${response.status}: ${await response.text()}`);
  }
}

/** Throws on failure. `sendMail` in ./send.ts is what callers use. */
export async function deliver(message: Message): Promise<void> {
  switch (activeMailDriver()) {
    case 'smtp':
      return deliverBySmtp(message);
    case 'resend':
      return deliverByResend(message);
    default:
      return deliverToLog(message);
  }
}
