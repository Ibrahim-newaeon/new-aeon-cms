// lib/account/otp.ts
import 'server-only';
import { db } from '@/lib/db';
import { customerOtp, customers } from '@/lib/db/schema';
import { eq, sql } from 'drizzle-orm';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import { sendSms } from '@/lib/sms';
import { randomInt } from 'node:crypto';

/**
 * Sign-in codes for shoppers.
 *
 * Only a phone that ALREADY has a customer record can request one. Customers
 * are created by placing an order — that is what makes the phone a reliable
 * merge key — and letting sign-in create rows would fill the table with people
 * who have never bought anything and hand a stranger a way to mint records.
 * The trade is that a first-time visitor cannot make an account, which is
 * correct for a shop whose accounts exist to show order history.
 */

export const CODE_TTL_MINUTES = 10;
export const MAX_ATTEMPTS = 5;

export type RequestResult = { ok: true } | { ok: false; reason: 'unknown' };

/** Six digits, from a CSPRNG rather than Math.random. */
function generateCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

export async function requestCode(phone: string, locale: 'ar' | 'en'): Promise<RequestResult> {
  const [customer] = await db
    .select({ id: customers.id })
    .from(customers)
    .where(eq(customers.phone, phone))
    .limit(1);

  if (!customer) return { ok: false, reason: 'unknown' };

  const code = generateCode();
  const codeHash = await hashPassword(code);
  const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60_000);

  // One row per phone: a new request REPLACES the old code, so an abandoned
  // request cannot be used later and the code in the latest SMS is the only
  // one that works.
  await db
    .insert(customerOtp)
    .values({ phone, codeHash, expiresAt, attemptsLeft: MAX_ATTEMPTS })
    .onConflictDoUpdate({
      target: customerOtp.phone,
      set: { codeHash, expiresAt, attemptsLeft: MAX_ATTEMPTS, createdAt: new Date() },
    });

  await sendSms({
    to: phone,
    body:
      locale === 'ar'
        ? `رمز الدخول: ${code} — صالح ${CODE_TTL_MINUTES} دقائق.`
        : `Your sign-in code is ${code}. It expires in ${CODE_TTL_MINUTES} minutes.`,
  });

  return { ok: true };
}

export type VerifyResult =
  | { ok: true; customerId: string }
  | { ok: false; reason: 'no-code' | 'expired' | 'wrong' | 'locked' };

export async function verifyCode(phone: string, code: string): Promise<VerifyResult> {
  const [row] = await db.select().from(customerOtp).where(eq(customerOtp.phone, phone)).limit(1);

  if (!row) return { ok: false, reason: 'no-code' };

  if (row.expiresAt.getTime() < Date.now()) {
    await db.delete(customerOtp).where(eq(customerOtp.phone, phone));
    return { ok: false, reason: 'expired' };
  }

  if (row.attemptsLeft <= 0) return { ok: false, reason: 'locked' };

  const matches = await verifyPassword(row.codeHash, code);

  if (!matches) {
    // Decremented in SQL rather than read-modify-write: two guesses racing
    // would otherwise both read the same count and cost only one attempt.
    await db
      .update(customerOtp)
      .set({ attemptsLeft: sql`${customerOtp.attemptsLeft} - 1` })
      .where(eq(customerOtp.phone, phone));
    return { ok: false, reason: 'wrong' };
  }

  const [customer] = await db
    .select({ id: customers.id })
    .from(customers)
    .where(eq(customers.phone, phone))
    .limit(1);

  if (!customer) return { ok: false, reason: 'no-code' };

  // Single use: the code is spent whether or not a session is kept.
  await db.delete(customerOtp).where(eq(customerOtp.phone, phone));

  return { ok: true, customerId: customer.id };
}
