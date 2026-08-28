// lib/email/send.ts
import 'server-only';
import { getSettings } from '@/lib/db/queries';
import { deliver, activeMailDriver, type Message } from './transport';

/**
 * The only entry point callers should use.
 *
 * Never throws. Every caller is doing something more important than sending
 * mail — placing an order, recording an enquiry — and that work is already
 * committed by the time we get here. A failed send must not turn a successful
 * order into a 500 the customer reads as "my order did not go through".
 */
export interface SendResult {
  ok: boolean;
  skipped?: 'no-recipient';
  error?: string;
}

export async function sendMail(message: Message): Promise<SendResult> {
  if (!message.to) return { ok: false, skipped: 'no-recipient' };

  try {
    await deliver(message);
    return { ok: true };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    // Logged loudly: with no retry queue, this line is the only trace that a
    // customer never got their confirmation.
    console.error(
      `[mail] delivery FAILED driver=${activeMailDriver()} to=${message.to} subject=${message.subject}: ${detail}`
    );
    return { ok: false, error: detail };
  }
}

/**
 * Where store-facing notifications go.
 *
 * Env first, settings second. A staging deploy restored from a production
 * database backup would otherwise inherit the real shop's contact address and
 * start emailing them about test orders.
 */
export async function storeRecipient(): Promise<string | null> {
  const fromEnv = process.env.MAIL_ADMIN_TO?.trim();
  if (fromEnv) return fromEnv;

  try {
    const settings = await getSettings();
    return settings?.contactEmail?.trim() || null;
  } catch (error) {
    console.error('[mail] could not read settings for store recipient:', error);
    return null;
  }
}
