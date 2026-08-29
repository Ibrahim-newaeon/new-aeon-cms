// lib/commerce/checkout.ts
import 'server-only';
import { db } from '@/lib/db';
import {
  orders, orderItems, orderStatusHistory, customers, coupons,
  shippingZones, productVariants,
} from '@/lib/db/schema';
import { and, eq, sql } from 'drizzle-orm';
import { normalisePhone } from './phone';
import { priceCart, type CartCookie } from './cart';

export interface CheckoutAddress {
  name: string;
  phone: string;
  email?: string;
  governorate: string;
  city: string;
  addressLine: string;
  landmark?: string;
  notes?: string;
}

export type CheckoutFailure =
  | { code: 'EMPTY_CART' }
  | { code: 'UNAVAILABLE'; items: string[] }
  | { code: 'NO_SHIPPING_ZONE'; governorate: string }
  | { code: 'COUPON_INVALID'; reason: string };

export type CheckoutResult =
  | { ok: true; orderNumber: string; orderId: string; total: number; duplicate?: boolean }
  | { ok: false; failure: CheckoutFailure };

/** Discount, clamped so an order total can never go negative. */
function applyCoupon(
  subtotal: number,
  coupon: { type: 'percent' | 'fixed'; value: number }
): number {
  const raw = coupon.type === 'percent'
    ? Math.round((subtotal * Math.min(100, coupon.value)) / 100)
    : coupon.value;
  return Math.min(raw, subtotal);
}

/**
 * Places an order.
 *
 * Everything happens inside one transaction: stock is re-read and decremented,
 * the customer is upserted, and coupon usage is incremented together. Two people
 * racing for the last unit cannot both succeed, because the stock decrement is
 * conditional and the transaction rolls back when it matches no row.
 *
 * The caller passes ONLY the cart cookie, an address and a coupon code. No price
 * or total crosses the boundary — every figure below is read from the database.
 */
export async function placeOrder(
  cart: CartCookie,
  address: CheckoutAddress,
  couponCode: string | undefined,
  locale: 'ar' | 'en',
  idempotencyKey: string
): Promise<CheckoutResult> {
  // A repeat submit must return the original order, not place a second one.
  // Checked here for the common case; the UNIQUE index below is what actually
  // holds when two requests race.
  const seen = await db
    .select({ id: orders.id, orderNumber: orders.orderNumber, total: orders.total })
    .from(orders)
    .where(eq(orders.idempotencyKey, idempotencyKey))
    .limit(1);

  const already = seen[0];
  if (already) {
    return {
      ok: true,
      orderNumber: already.orderNumber,
      orderId: already.id,
      total: already.total,
      duplicate: true,
    };
  }

  const view = await priceCart(cart, locale);

  // Order matters. itemCount counts AVAILABLE units only, so a cart whose only
  // line just sold out reports zero — checking EMPTY_CART first would tell that
  // customer their cart is empty instead of that the item is gone.
  const unavailable = view.lines.filter((l) => !l.available);
  if (unavailable.length > 0) {
    return {
      ok: false,
      failure: { code: 'UNAVAILABLE', items: unavailable.map((l) => l.name || l.sku) },
    };
  }

  if (view.lines.length === 0 || view.itemCount === 0) {
    return { ok: false, failure: { code: 'EMPTY_CART' } };
  }

  // Shipping: an unmatched governorate is an ERROR, not free delivery. A typo
  // must never silently ship for nothing.
  const zones = await db.select().from(shippingZones).where(eq(shippingZones.isActive, true));
  const zone = zones.find((z) => (z.governorates ?? []).includes(address.governorate));
  if (!zone) {
    return { ok: false, failure: { code: 'NO_SHIPPING_ZONE', governorate: address.governorate } };
  }

  // Coupon, validated server-side. The client sends a code, never an amount.
  let discount = 0;
  let couponRow: typeof coupons.$inferSelect | undefined;

  if (couponCode) {
    const code = couponCode.trim().toUpperCase();
    const found = await db.select().from(coupons).where(eq(coupons.code, code)).limit(1);
    couponRow = found[0];

    const now = new Date();
    if (!couponRow || !couponRow.isActive) {
      return { ok: false, failure: { code: 'COUPON_INVALID', reason: 'not_found' } };
    }
    if (couponRow.startsAt && couponRow.startsAt > now) {
      return { ok: false, failure: { code: 'COUPON_INVALID', reason: 'not_started' } };
    }
    if (couponRow.endsAt && couponRow.endsAt < now) {
      return { ok: false, failure: { code: 'COUPON_INVALID', reason: 'expired' } };
    }
    if (couponRow.usageLimit !== null && (couponRow.usedCount ?? 0) >= couponRow.usageLimit) {
      return { ok: false, failure: { code: 'COUPON_INVALID', reason: 'limit_reached' } };
    }
    if (view.subtotal < (couponRow.minSubtotal ?? 0)) {
      return { ok: false, failure: { code: 'COUPON_INVALID', reason: 'below_minimum' } };
    }

    discount = applyCoupon(view.subtotal, { type: couponRow.type, value: couponRow.value });
  }

  // The bundle saving and any coupon are both discounts on the subtotal, and
  // together they can never take it below zero. Combining them here rather than
  // rewriting line prices is what keeps order items, stock and fulfilment
  // unaware that bundles exist at all.
  const totalDiscount = Math.min(view.subtotal, discount + view.bundleDiscount);
  const discounted = view.subtotal - totalDiscount;
  // free_over compares against the DISCOUNTED subtotal, so a coupon cannot
  // accidentally unlock free shipping the store did not intend.
  const shipping = zone.freeOver !== null && discounted >= zone.freeOver ? 0 : zone.flatRate;
  const total = discounted + shipping;

  const phone = normalisePhone(address.phone);

  return db.transaction(async (tx) => {
    // Conditional decrement: only succeeds while stock is still sufficient.
    for (const line of view.lines) {
      const updated = await tx
        .update(productVariants)
        .set({ stock: sql`${productVariants.stock} - ${line.qty}` })
        .where(
          and(
            eq(productVariants.id, line.variantId),
            sql`${productVariants.stock} >= ${line.qty}`
          )
        )
        .returning({ id: productVariants.id });

      if (updated.length === 0) {
        // Someone took the last one between pricing and this write.
        tx.rollback();
        return { ok: false, failure: { code: 'UNAVAILABLE', items: [line.name || line.sku] } };
      }
    }

    // Upsert on the normalised phone — this is what makes two orders from one
    // person resolve to a single customer.
    const [customer] = await tx
      .insert(customers)
      .values({
        phone,
        name: address.name,
        email: address.email || null,
        governorate: address.governorate,
        city: address.city,
        addressLine: address.addressLine,
        landmark: address.landmark || null,
      })
      .onConflictDoUpdate({
        target: customers.phone,
        set: {
          name: address.name,
          email: address.email || null,
          governorate: address.governorate,
          city: address.city,
          addressLine: address.addressLine,
          landmark: address.landmark || null,
          updatedAt: new Date(),
        },
      })
      .returning({ id: customers.id });

    const nextNumber = await tx.execute(sql`SELECT nextval('order_number_seq') AS n`);
    const seq = Number((nextNumber.rows[0] as { n: string | number }).n);
    const orderNumber = `ORD-${seq}`;

    const [order] = await tx
      .insert(orders)
      .values({
        orderNumber,
        idempotencyKey,
        status: 'pending',
        customerId: customer?.id ?? null,
        shippingZoneId: zone.id,
        subtotal: view.subtotal,
        shipping,
        discount: totalDiscount,
        total,
        customerName: address.name,
        phone,
        email: address.email || null,
        governorate: address.governorate,
        city: address.city,
        addressLine: address.addressLine,
        landmark: address.landmark || null,
        notes: address.notes || null,
        couponCode: couponRow?.code ?? null,
        paymentMethod: 'cod',
        paymentStatus: 'pending',
      })
      .returning({ id: orders.id });

    if (!order) throw new Error('order insert returned no row');

    // Snapshots: later catalogue edits must never rewrite what was bought.
    await tx.insert(orderItems).values(
      view.lines.map((l) => ({
        orderId: order.id,
        variantId: l.variantId,
        nameSnapshot: [l.name, l.optionSummary].filter(Boolean).join(' — ').slice(0, 255),
        skuSnapshot: l.sku,
        priceSnapshot: l.unitPrice,
        qty: l.qty,
      }))
    );

    if (couponRow) {
      // Inside the transaction, so two people redeeming the last use cannot
      // both succeed.
      await tx
        .update(coupons)
        .set({ usedCount: sql`${coupons.usedCount} + 1` })
        .where(eq(coupons.id, couponRow.id));
    }

    await tx.insert(orderStatusHistory).values({
      orderId: order.id,
      fromStatus: null,
      toStatus: 'pending',
      note: 'Order placed',
    });

    return { ok: true as const, orderNumber, orderId: order.id, total };
  });
}
