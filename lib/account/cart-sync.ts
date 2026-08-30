// lib/account/cart-sync.ts
import 'server-only';
import { db } from '@/lib/db';
import { customerCarts } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { currentCustomer } from '@/lib/auth/customer-session';
import { readCartCookie, writeCartCookie, MAX_LINES, type CartCookie } from '@/lib/commerce/cart';

/**
 * A signed-in shopper's cart, kept across devices.
 *
 * The cookie stays the source of truth while browsing: it is what an anonymous
 * visitor has, it costs nothing to read, and every existing cart path already
 * uses it. This mirrors it to a row so a cart built on a phone is still there
 * on a laptop.
 */

/** Called after any cart change; a no-op for a guest. */
export async function mirrorCart(cart: CartCookie): Promise<void> {
  const session = await currentCustomer();
  if (!session) return;

  if (cart.lines.length === 0) {
    await db.delete(customerCarts).where(eq(customerCarts.customerId, session.sub));
    return;
  }

  await db
    .insert(customerCarts)
    .values({ customerId: session.sub, lines: cart.lines, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: customerCarts.customerId,
      set: { lines: cart.lines, updatedAt: new Date() },
    });
}

/**
 * Merges the saved cart into the cookie at sign-in.
 *
 * MERGE, not replace, in either direction. Replacing the cookie would throw
 * away whatever they just added as a guest — often the very thing that made
 * them sign in. Replacing the saved cart would lose the phone cart they came
 * to the laptop for. Quantities take the LARGER of the two: someone who put
 * three in the basket on one device and one on another meant three.
 */
export async function mergeSavedCart(customerId: string): Promise<void> {
  const [saved] = await db
    .select({ lines: customerCarts.lines })
    .from(customerCarts)
    .where(eq(customerCarts.customerId, customerId))
    .limit(1);

  const cookie = await readCartCookie();
  if (!saved?.lines?.length) {
    // Nothing saved: push whatever the guest has up, so it is there next time.
    if (cookie.lines.length > 0) {
      await db
        .insert(customerCarts)
        .values({ customerId, lines: cookie.lines, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: customerCarts.customerId,
          set: { lines: cookie.lines, updatedAt: new Date() },
        });
    }
    return;
  }

  const byVariant = new Map<string, number>();
  for (const line of saved.lines) byVariant.set(line.variantId, line.qty);
  for (const line of cookie.lines) {
    byVariant.set(line.variantId, Math.max(byVariant.get(line.variantId) ?? 0, line.qty));
  }

  // Capped at the same limit the cookie enforces, so a merge cannot produce a
  // cart the rest of the code refuses to price.
  const merged = [...byVariant.entries()]
    .slice(0, MAX_LINES)
    .map(([variantId, qty]) => ({ variantId, qty }));

  await writeCartCookie({ lines: merged });
  await db
    .update(customerCarts)
    .set({ lines: merged, updatedAt: new Date() })
    .where(eq(customerCarts.customerId, customerId));
}
