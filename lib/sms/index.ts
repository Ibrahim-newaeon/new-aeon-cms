// lib/sms/index.ts

/**
 * Sending an SMS.
 *
 * An interface with a console transport rather than a provider integration,
 * because choosing one is a commercial decision — it costs money per message
 * and the right vendor differs by country. Everything around it is finished, so
 * plugging in Twilio or a local Jordanian gateway is one function.
 *
 * The console transport is not a stub that pretends to work: it prints the
 * message and reports success, which is right for local development and
 * unmistakable in a log if it ever ran in production.
 */
export interface SmsMessage {
  to: string;
  body: string;
}

export interface SmsTransport {
  name: string;
  send(message: SmsMessage): Promise<void>;
}

const consoleTransport: SmsTransport = {
  name: 'console',
  async send({ to, body }) {
    console.info(`[sms:console] to ${to}: ${body}`);
  },
};

let transport: SmsTransport = consoleTransport;

/** Swap in a real provider at startup. */
export function setSmsTransport(next: SmsTransport): void {
  transport = next;
}

export function smsTransportName(): string {
  return transport.name;
}

export async function sendSms(message: SmsMessage): Promise<void> {
  await transport.send(message);
}
