// lib/account/otp.ts
import 'server-only';
import { db } from '@/lib/db';
import { customerOtp, customers } from '@/lib/db/schema';
import { eq, sql } from 'drizzle-orm';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import { sendSms } from '@/lib/sms';
import { randomInt } from 'node:crypto';

/**
 * One-time codes, used for two things: signing in, and proving a phone number
 * before registering against it.
 *
 * A code is issued for ANY valid number, not only one that has ordered.
 * Anyone may open an account, and the code is what proves the number is
 * theirs — which matters most in the case it was built for: a number that
 * already has orders behind it. Registering against one of those hands over
 * somebody's name, address and order history, so it is gated on this.
 *
 * Issuing for unknown numbers also removes an enumeration oracle. When only
 * known numbers got a code, "did a code arrive" answered the question of
 * whether a given person shops here.
 */

export const CODE_TTL_MINUTES = 10;
export const MAX_ATTEMPTS = 5;

export type RequestResult = { ok: true };

/** Six digits, from a CSPRNG rather than Math.random. */
function generateCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

export async function requestCode(phone: string, locale: 'ar' | 'en'): Promise<RequestResult> {
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
  /**
   * customerId is null when the number is proven but no customer row exists.
   * hasPassword tells apart a full account from a buyer the shop knows only
   * because they ordered — the second is signed in, but should still be
   * offered a password so they can get back in without a code next time.
   */
  | { ok: true; customerId: string | null; hasPassword: boolean }
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
    .select({ id: customers.id, passwordHash: customers.passwordHash })
    .from(customers)
    .where(eq(customers.phone, phone))
    .limit(1);

  // Single use: the code is spent whether or not a session is kept.
  await db.delete(customerOtp).where(eq(customerOtp.phone, phone));

  // A proven number with no account is a successful verification, not a
  // failure — it is exactly the state a new registration starts from.
  return {
    ok: true,
    customerId: customer?.id ?? null,
    hasPassword: Boolean(customer?.passwordHash),
  };
}
