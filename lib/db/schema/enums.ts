// lib/db/schema/enums.ts
import { pgEnum, pgSequence } from 'drizzle-orm/pg-core';

/**
 * Human-readable order numbers (ORD-1001), read by lib/commerce/checkout.
 *
 * Declared HERE, not only in migration 0006. drizzle-kit push diffs the
 * database against this file, so an object it cannot see is an object it
 * drops: running db:push deleted this sequence and every checkout 500'd on
 * `nextval`. Declaring it means push creates and keeps it, and the schema
 * stops lying about what the database contains.
 */
export const orderNumberSeq = pgSequence('order_number_seq', { startWith: 1000 });

// Enums
export const userRoleEnum = pgEnum('user_role', ['admin', 'editor', 'author']);
export const contentStatusEnum = pgEnum('content_status', ['draft', 'published', 'archived']);
export const localeEnum = pgEnum('locale', ['ar', 'en']);
export const navLocationEnum = pgEnum('nav_location', ['header', 'footer', 'sidebar', 'mobile']);

// orders.status was a bare varchar(50): any typo created a phantom status.
export const orderStatusEnum = pgEnum('order_status', [
  'pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded',
]);

// `authorized` and `failed` are unused by COD. They exist so adding a payment
// gateway later needs no migration — the point of the "COD now, online later"
// decision.
export const paymentStatusEnum = pgEnum('payment_status', [
  'pending', 'authorized', 'paid', 'failed', 'refunded',
]);

export const paymentMethodEnum = pgEnum('payment_method', ['cod', 'card', 'wallet']);
export const couponTypeEnum = pgEnum('coupon_type', ['percent', 'fixed']);
export const reviewStatusEnum = pgEnum('review_status', ['pending', 'approved', 'rejected']);
export const formTypeEnum = pgEnum('form_type', ['contact', 'newsletter']);

