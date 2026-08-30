// lib/commerce/order-access.ts
import 'server-only';
import { db } from '@/lib/db';
import { orders } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { currentCustomer } from '@/lib/auth/customer-session';
import { normalisePhone } from './phone';
import { getStoreCountry } from './regions';

/**
 * Who may see an order.
 *
 * The order page used to render on the order number alone. Numbers come from a
 * sequence — ORD-1048, ORD-1049, ORD-1050 — so anyone could count upward and
 * read every customer's name, phone and delivery address in turn. The page was
 * marked noindex, which keeps it out of Google and does nothing about someone
 * simply typing the next number.
 *
 * Three ways in, and a number alone is not one of them:
 *
 *   1. You just placed it. Checkout drops the number in an httpOnly cookie so
 *      the confirmation page works without an account.
 *   2. You are signed in and the order is yours.
 *   3. You supply the phone the order was placed with — the lookup flow, and
 *      the only route for a guest returning later.
 */

export const RECENT_ORDERS_COOKIE = 'recent_orders';
const MAX_REMEMBERED = 10;
const REMEMBER_DAYS = 30;

/** Remembers an order this browser just placed. */
export async function rememberOrder(orderNumber: string): Promise<void> {
  const { cookies } = await import('next/headers');
  const store = await cookies();

  const existing = (store.get(RECENT_ORDERS_COOKIE)?.value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  // Newest first, de-duplicated, capped — a cookie is not a database and an
  // unbounded list eventually stops being sent at all.
  const next = [orderNumber, ...existing.filter((n) => n !== orderNumber)].slice(0, MAX_REMEMBERED);

  store.set(RECENT_ORDERS_COOKIE, next.join(','), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * REMEMBER_DAYS,
  });
}

async function placedHere(orderNumber: string): Promise<boolean> {
  const { cookies } = await import('next/headers');
  const store = await cookies();
  return (store.get(RECENT_ORDERS_COOKIE)?.value ?? '')
    .split(',')
    .map((s) => s.trim())
    .includes(orderNumber);
}

export type OrderAccess =
  /**
   * `via` is how they got in, which the page uses for wording: only somebody
   * who JUST placed an order should be told it "has been received". Revisiting
   * a delivered order from the account and being congratulated on placing it
   * reads as a system that has lost track.
   */
  | { allowed: true; order: typeof orders.$inferSelect; via: 'placed' | 'account' | 'phone' }
  /** The order exists but this visitor has not shown they may see it. */
  | { allowed: false; exists: true }
  | { allowed: false; exists: false };

export async function accessOrder(
  orderNumber: string,
  suppliedPhone?: string
): Promise<OrderAccess> {
  const [order] = await db
    .select()
    .from(orders)
    .where(eq(orders.orderNumber, orderNumber))
    .limit(1);

  if (!order) return { allowed: false, exists: false };

  if (await placedHere(orderNumber)) return { allowed: true, order, via: 'placed' };

  const session = await currentCustomer();
  if (session && order.customerId === session.sub) return { allowed: true, order, via: 'account' };

  if (suppliedPhone?.trim()) {
    // Normalised on both sides, so `07…` matches an order stored as `+962…`.
    const given = normalisePhone(suppliedPhone, await getStoreCountry());
    if (given && given === order.phone) return { allowed: true, order, via: 'phone' };
  }

  // "Exists but not yours" is not leaked to the caller's UI — see the page,
  // which shows the same prompt either way.
  return { allowed: false, exists: true };
}
