// lib/commerce/reviews.ts
import 'server-only';
import { db } from '@/lib/db';
import { productReviews, users } from '@/lib/db/schema';
import { and, desc, eq, sql } from 'drizzle-orm';
import { normalisePhone } from './phone';

/**
 * Product reviews, moderated.
 *
 * Nothing a shopper writes is publicly visible until an admin approves it. An
 * unmoderated public write endpoint on a storefront is a spam target, and a
 * shop owner discovering abuse already published under their brand costs far
 * more than a queue does.
 */

export const MIN_RATING = 1;
export const MAX_RATING = 5;

export interface ReviewSummary {
  average: number;
  count: number;
  /** How many approved reviews gave each rating, 1..5. */
  distribution: Record<number, number>;
}

export type SubmitFailure = 'ALREADY_REVIEWED' | 'INVALID_RATING' | 'PRODUCT_NOT_FOUND';

export type SubmitResult = { ok: true; id: string } | { ok: false; reason: SubmitFailure };

export async function submitReview(input: {
  productId: string;
  customerName: string;
  phone: string;
  rating: number;
  body: string;
}): Promise<SubmitResult> {
  if (
    !Number.isInteger(input.rating) ||
    input.rating < MIN_RATING ||
    input.rating > MAX_RATING
  ) {
    return { ok: false, reason: 'INVALID_RATING' };
  }

  // The same normalisation that merges customers, so one person cannot post
  // twice by writing +962 once and 07 the next time.
  const phone = normalisePhone(input.phone);

  try {
    const [row] = await db
      .insert(productReviews)
      .values({
        productId: input.productId,
        customerName: input.customerName.trim(),
        phone,
        rating: input.rating,
        body: input.body.trim(),
      })
      .returning({ id: productReviews.id });

    return { ok: true, id: row!.id };
  } catch (error) {
    // Drizzle wraps the driver error, so the SQLSTATE lives on `cause`, not on
    // the thrown object. Reading only the top level made every duplicate a 500.
    const code =
      (error as { code?: string }).code ??
      ((error as { cause?: { code?: string } }).cause?.code);

    // 23505 = the (product, phone) unique index. Enforced by the database
    // rather than a prior SELECT, because two concurrent submissions both pass
    // a check-then-insert.
    if (code === '23505') return { ok: false, reason: 'ALREADY_REVIEWED' };
    // 23503 = the product FK.
    if (code === '23503') return { ok: false, reason: 'PRODUCT_NOT_FOUND' };

    throw error;
  }
}

/** Approved reviews for the storefront, newest first. */
export async function listApprovedReviews(productId: string, limit = 50) {
  return db
    .select({
      id: productReviews.id,
      customerName: productReviews.customerName,
      rating: productReviews.rating,
      body: productReviews.body,
      createdAt: productReviews.createdAt,
    })
    .from(productReviews)
    .where(and(eq(productReviews.productId, productId), eq(productReviews.status, 'approved')))
    .orderBy(desc(productReviews.createdAt))
    .limit(limit);
}

/**
 * Aggregate rating, computed rather than stored.
 *
 * A denormalised average has to be recalculated on every approve, reject and
 * edit; the first path that forgets leaves a number that is quietly wrong
 * forever, and nothing ever notices. A join is cheaper than that.
 */
export async function reviewSummary(productId: string): Promise<ReviewSummary> {
  const rows = await db
    .select({ rating: productReviews.rating, n: sql<number>`count(*)::int` })
    .from(productReviews)
    .where(and(eq(productReviews.productId, productId), eq(productReviews.status, 'approved')))
    .groupBy(productReviews.rating);

  const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let total = 0;
  let count = 0;

  for (const row of rows) {
    const n = Number(row.n);
    distribution[row.rating] = n;
    total += row.rating * n;
    count += n;
  }

  return {
    // One decimal place: the extra digits of a raw mean are noise dressed as
    // precision when the sample is a handful of reviews.
    average: count === 0 ? 0 : Math.round((total / count) * 10) / 10,
    count,
    distribution,
  };
}

/** Everything awaiting moderation, plus recently decided, for the admin queue. */
export async function listReviewsForAdmin(status?: 'pending' | 'approved' | 'rejected') {
  return db
    .select({
      id: productReviews.id,
      productId: productReviews.productId,
      customerName: productReviews.customerName,
      phone: productReviews.phone,
      rating: productReviews.rating,
      body: productReviews.body,
      status: productReviews.status,
      createdAt: productReviews.createdAt,
      moderatedBy: users.name,
    })
    .from(productReviews)
    .leftJoin(users, eq(users.id, productReviews.moderatedBy))
    .where(status ? eq(productReviews.status, status) : undefined)
    .orderBy(desc(productReviews.createdAt))
    .limit(200);
}

export async function moderateReview(
  id: string,
  status: 'approved' | 'rejected',
  moderatorId: string
): Promise<boolean> {
  const updated = await db
    .update(productReviews)
    .set({ status, moderatedBy: moderatorId, moderatedAt: new Date() })
    .where(eq(productReviews.id, id))
    .returning({ id: productReviews.id });

  return updated.length > 0;
}

export async function countPendingReviews(): Promise<number> {
  const rows = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(productReviews)
    .where(eq(productReviews.status, 'pending'));

  return rows[0]?.value ?? 0;
}
