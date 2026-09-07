// lib/sms/index.ts

/**
 * SMS delivery. Drivers mirror mail: `log` for local, `twilio` for production.
 * PHP is never involved — this is account OTP for customer phone login.
 */

import { createTwilioTransport } from './twilio';

export interface SmsMessage {
  to: string;
  body: string;
}

export interface SmsTransport {
  name: string;
  send(message: SmsMessage): Promise<void>;
}

const consoleTransport: SmsTransport = {
  name: 'log',
  async send({ to, body }) {
    console.info(`[sms:log] to ${to}: ${body}`);
  },
};

let transport: SmsTransport | null = null;

function resolveTransport(): SmsTransport {
  if (transport) return transport;

  const driver = (process.env.SMS_DRIVER || 'log').toLowerCase();

  if (driver === 'twilio') {
    const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
    const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
    const from = process.env.TWILIO_FROM_NUMBER?.trim();
    if (!accountSid || !authToken || !from) {
      throw new Error('TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM_NUMBER are required when SMS_DRIVER=twilio');
    }
    transport = createTwilioTransport({ accountSid, authToken, from });
    return transport;
  }

  if (driver !== 'log' && driver !== 'console') {
    throw new Error(`Unknown SMS_DRIVER: ${driver}`);
  }

  transport = consoleTransport;
  return transport;
}

/** Swap in a transport (tests). */
export function setSmsTransport(next: SmsTransport): void {
  transport = next;
}

export function smsTransportName(): string {
  try {
    return resolveTransport().name;
  } catch {
    return 'unconfigured';
  }
}

/** True when production would deliver real SMS (not log-only). */
export function smsIsProductionReady(): boolean {
  return smsTransportName() === 'twilio';
}

export async function sendSms(message: SmsMessage): Promise<void> {
  await resolveTransport().send(message);
}
