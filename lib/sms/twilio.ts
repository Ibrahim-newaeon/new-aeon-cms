// lib/sms/twilio.ts
import type { SmsTransport } from './index';

/**
 * Twilio REST API via fetch — no SDK dependency.
 * Docs: https://www.twilio.com/docs/sms/api/message-resource
 */
export function createTwilioTransport(opts: {
  accountSid: string;
  authToken: string;
  from: string;
}): SmsTransport {
  const { accountSid, authToken, from } = opts;
  const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const basic = Buffer.from(`${accountSid}:${authToken}`).toString('base64');

  return {
    name: 'twilio',
    async send({ to, body }) {
      const form = new URLSearchParams({ To: to, From: from, Body: body });
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${basic}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: form.toString(),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Twilio SMS failed (${res.status}): ${text.slice(0, 200)}`);
      }
    },
  };
}
