// lib/account/register.ts
import 'server-only';
import { db } from '@/lib/db';
import { customers, orders } from '@/lib/db/schema';
import { eq, sql } from 'drizzle-orm';
import { hashPassword, verifyPassword } from '@/lib/auth/password';

/**
 * Creating and using a customer account.
 *
 * The phone number is the identity. It is already the key that ties orders to
 * a person, so registering with it is what makes "my orders" work without
 * anyone having to link anything.
 *
 * That is also the whole security problem. A row in `customers` may already
 * exist because someone ORDERED with that number — carrying their name,
 * address and order history. Letting a stranger register against it would hand
 * over all of that. So the rule is:
 *
 *   phone has no customer row      -> register freely
 *   phone has a row, no password   -> must prove the number by code first
 *   phone has a row with a password-> that is an existing account; sign in
 *
 * The middle case is the one worth being careful about, because it is the
 * common one: every buyer this shop has ever had is in that state.
 */

export type RegisterOutcome =
  | { ok: true; customerId: string }
  | { ok: false; reason: 'exists' | 'needs-verification' | 'weak-password' };

export interface RegisterInput {
  phone: string;
  name: string;
  password: string;
  email?: string | null;
}

/** Long enough to matter, short enough that people do not write it down. */
export const MIN_PASSWORD_LENGTH = 8;

/**
 * NOT exported, and deliberately so.
 *
 * This function's answer IS the fact "is this number a customer here". It was
 * briefly behind a GET endpoint so the sign-in form could show the right
 * fields, which made that question answerable by anyone. The form now lets the
 * shopper choose their own path instead, and this stays internal — if it ever
 * needs to leave this module, that is the moment to ask what is being told to
 * whom.
 */
async function claimState(phone: string): Promise<'free' | 'unclaimed' | 'registered'> {
  const [row] = await db
    .select({ id: customers.id, passwordHash: customers.passwordHash })
    .from(customers)
    .where(eq(customers.phone, phone))
    .limit(1);

  if (!row) return 'free';
  return row.passwordHash ? 'registered' : 'unclaimed';
}

/**
 * @param phoneProven true when the caller has just verified this number with a
 * one-time code. Required to take over a row that already has orders.
 */
export async function register(
  input: RegisterInput,
  phoneProven: boolean
): Promise<RegisterOutcome> {
  if (input.password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, reason: 'weak-password' };
  }

  const state = await claimState(input.phone);
  if (state === 'registered') return { ok: false, reason: 'exists' };
  if (state === 'unclaimed' && !phoneProven) {
    // There is history behind this number. Proving ownership is the price of
    // taking it over.
    //
    // The route already refuses an unproven registration for ANY number, so
    // this is a second lock on the same door rather than the only one — the
    // consequence of getting it wrong is handing over somebody's order
    // history, which is worth two locks.
    return { ok: false, reason: 'needs-verification' };
  }

  const passwordHash = await hashPassword(input.password);

  if (state === 'unclaimed') {
    const [row] = await db
      .update(customers)
      .set({
        passwordHash,
        registeredAt: new Date(),
        // The name they register under wins; the old one came from an order
        // form and may be a courier's shorthand.
        name: input.name,
        email: input.email || sql`${customers.email}`,
        updatedAt: new Date(),
      })
      .where(eq(customers.phone, input.phone))
      .returning({ id: customers.id });
    return { ok: true, customerId: row!.id };
  }

  const [row] = await db
    .insert(customers)
    .values({
      phone: input.phone,
      name: input.name,
      email: input.email || null,
      passwordHash,
      registeredAt: new Date(),
    })
    .returning({ id: customers.id });

  return { ok: true, customerId: row!.id };
}

export type SignInOutcome =
  | { ok: true; customerId: string }
  | { ok: false; reason: 'no-account' | 'not-registered' | 'wrong' };

export async function signInWithPassword(
  phone: string,
  password: string
): Promise<SignInOutcome> {
  const [row] = await db
    .select({ id: customers.id, passwordHash: customers.passwordHash })
    .from(customers)
    .where(eq(customers.phone, phone))
    .limit(1);

  if (!row) return { ok: false, reason: 'no-account' };
  if (!row.passwordHash) {
    // Known buyer, never registered. Told apart from "no account" so the UI can
    // offer to set a password rather than a dead end.
    return { ok: false, reason: 'not-registered' };
  }

  const matches = await verifyPassword(row.passwordHash, password);
  return matches ? { ok: true, customerId: row.id } : { ok: false, reason: 'wrong' };
}

/** Used after a code sign-in, which doubles as password reset. */
export async function setPassword(customerId: string, password: string): Promise<boolean> {
  if (password.length < MIN_PASSWORD_LENGTH) return false;
  await db
    .update(customers)
    .set({
      passwordHash: await hashPassword(password),
      registeredAt: sql`coalesce(${customers.registeredAt}, now())`,
      updatedAt: new Date(),
    })
    .where(eq(customers.id, customerId));
  return true;
}

/** Whether this number has any orders — drives the "you have history" wording. */
export async function hasOrders(customerId: string): Promise<boolean> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(orders)
    .where(eq(orders.customerId, customerId));
  return (row?.n ?? 0) > 0;
}
