// lib/commerce/orders.ts
import 'server-only';
import { db } from '@/lib/db';
import { orders, orderItems, orderStatusHistory, productVariants } from '@/lib/db/schema';
import { and, eq, sql, desc, or, ilike, count } from 'drizzle-orm';
import { canTransition, restoresStock, type OrderStatus, type PaymentStatus } from './order-status';

export interface OrderListFilters {
  status?: OrderStatus;
  search?: string;
  page?: number;
  perPage?: number;
}

export interface OrderListResult {
  rows: (typeof orders.$inferSelect)[];
  total: number;
  page: number;
  perPage: number;
  pageCount: number;
}

/**
 * Paginated, filtered list.
 *
 * Filtering happens in SQL rather than in the browser. `DataTable`'s in-memory
 * approach is right for coupons and shipping zones — bounded sets an editor
 * curates — but orders grow without limit, and shipping 20,000 of them to the
 * client on every page view is not a thing that degrades gracefully.
 */
export async function listOrders(filters: OrderListFilters = {}): Promise<OrderListResult> {
  const perPage = Math.min(Math.max(filters.perPage ?? 25, 1), 100);
  const page = Math.max(filters.page ?? 1, 1);

  const conditions = [];
  if (filters.status) conditions.push(eq(orders.status, filters.status));

  const search = filters.search?.trim();
  if (search) {
    // ilike for case-insensitive matching; Arabic names are unaffected by case
    // but the order number and Latin names are not.
    const term = `%${search}%`;
    conditions.push(
      or(
        ilike(orders.orderNumber, term),
        ilike(orders.customerName, term),
        ilike(orders.phone, term),
        ilike(orders.email, term)
      )!
    );
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, totalRow] = await Promise.all([
    db
      .select()
      .from(orders)
      .where(where)
      .orderBy(desc(orders.createdAt))
      .limit(perPage)
      .offset((page - 1) * perPage),
    db.select({ value: count() }).from(orders).where(where),
  ]);

  const total = totalRow[0]?.value ?? 0;

  return { rows, total, page, perPage, pageCount: Math.max(1, Math.ceil(total / perPage)) };
}

export async function getOrderDetail(id: string) {
  const [order] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  if (!order) return null;

  const [items, history] = await Promise.all([
    db.select().from(orderItems).where(eq(orderItems.orderId, id)),
    db
      .select()
      .from(orderStatusHistory)
      .where(eq(orderStatusHistory.orderId, id))
      .orderBy(desc(orderStatusHistory.createdAt)),
  ]);

  return { order, items, history };
}

export type TransitionResult =
  | { ok: true; from: OrderStatus; to: OrderStatus; stockRestored: boolean }
  | { ok: false; code: 'NOT_FOUND' | 'ILLEGAL_TRANSITION' | 'RACED'; from?: OrderStatus };

/**
 * Moves an order to a new status.
 *
 * Three things happen together or not at all: the status update, the history
 * row, and — for a cancel or refund — returning the units to stock.
 *
 * The concurrency guard is the `WHERE status = <what we read>` predicate on the
 * update. Two admins cancelling the same order both pass `canTransition`,
 * because both read `pending`; only one of their updates matches the predicate.
 * The loser gets zero rows back and rolls back, so the stock is restored once.
 * Checking `canTransition` alone would be a check-then-act race that returns
 * the stock twice and quietly inflates inventory.
 */
export async function transitionOrder(input: {
  orderId: string;
  to: OrderStatus;
  note?: string | null;
  changedBy?: string | null;
}): Promise<TransitionResult> {
  const { orderId, to, note, changedBy } = input;

  return db.transaction(async (tx) => {
    const [current] = await tx
      .select({ id: orders.id, status: orders.status })
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);

    if (!current) return { ok: false as const, code: 'NOT_FOUND' as const };

    const from = current.status;
    if (!canTransition(from, to)) {
      return { ok: false as const, code: 'ILLEGAL_TRANSITION' as const, from };
    }

    const updated = await tx
      .update(orders)
      .set({ status: to, updatedAt: new Date() })
      .where(and(eq(orders.id, orderId), eq(orders.status, from)))
      .returning({ id: orders.id });

    if (updated.length === 0) {
      // Someone else moved this order between our read and our write.
      return { ok: false as const, code: 'RACED' as const, from };
    }

    const shouldRestore = restoresStock(to);
    if (shouldRestore) {
      const lines = await tx
        .select({ variantId: orderItems.variantId, qty: orderItems.qty })
        .from(orderItems)
        .where(eq(orderItems.orderId, orderId));

      // Reachable exactly once per order: both restoring statuses are terminal
      // in the state machine, and the predicate above serialises concurrent
      // attempts.
      for (const line of lines) {
        await tx
          .update(productVariants)
          .set({ stock: sql`${productVariants.stock} + ${line.qty}` })
          .where(eq(productVariants.id, line.variantId));
      }
    }

    await tx.insert(orderStatusHistory).values({
      orderId,
      fromStatus: from,
      toStatus: to,
      note: note?.trim() || null,
      changedBy: changedBy ?? null,
    });

    return { ok: true as const, from, to, stockRestored: shouldRestore };
  });
}

/**
 * Payment status, tracked separately from fulfilment.
 *
 * For COD these genuinely are independent: an order is `delivered` and `paid`
 * at the same moment, but a shop also needs to record "delivered, driver has
 * not handed in the cash yet". No state machine here — the shop's own
 * bookkeeping decides, and constraining it would fight real practice.
 */
export async function setPaymentStatus(orderId: string, to: PaymentStatus): Promise<boolean> {
  const updated = await db
    .update(orders)
    .set({ paymentStatus: to, updatedAt: new Date() })
    .where(eq(orders.id, orderId))
    .returning({ id: orders.id });

  return updated.length > 0;
}
