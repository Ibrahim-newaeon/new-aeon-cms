// lib/db/schema/engagement.ts
import {
  pgTable, uuid, varchar, text, integer, boolean,
  timestamp, jsonb, index, uniqueIndex, primaryKey
} from 'drizzle-orm/pg-core';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { reviewStatusEnum, localeEnum } from './enums';
import { products, productVariants, customers } from './commerce';
import { users } from './auth';
import { relations } from 'drizzle-orm';

export const productReviews = pgTable('product_reviews', {
  id: uuid('id').primaryKey().defaultRandom(),
  productId: uuid('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  customerName: varchar('customer_name', { length: 255 }).notNull(),
  phone: varchar('phone', { length: 50 }).notNull(),
  rating: integer('rating').notNull(),
  body: text('body').notNull(),
  status: reviewStatusEnum('status').notNull().default('pending'),
  moderatedBy: uuid('moderated_by').references(() => users.id),
  moderatedAt: timestamp('moderated_at'),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  productStatusIdx: index('product_reviews_product_status_idx').on(table.productId, table.status),
  onePerPerson: uniqueIndex('product_reviews_product_phone_idx').on(table.productId, table.phone),
}));

/**
 * A bundle is priced as a FIXED total, not as a computed discount.
 *
 * A percentage off the sum means a later price change to any component
 * silently changes what the bundle costs — and the shop finds out from a
 * customer. A fixed price is what was agreed.
 */
export const productBundles = pgTable('product_bundles', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: varchar('slug', { length: 255 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  price: integer('price').notNull(),
  image: text('image'),
  isActive: boolean('is_active').default(true),
  sortOrder: integer('sort_order').default(0),
  createdAt: timestamp('created_at').defaultNow(),
});

export const bundleItems = pgTable('bundle_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  bundleId: uuid('bundle_id').notNull().references(() => productBundles.id, { onDelete: 'cascade' }),
  variantId: uuid('variant_id').notNull().references(() => productVariants.id),
  qty: integer('qty').notNull().default(1),
}, (table) => ({
  bundleIdx: index('bundle_items_bundle_idx').on(table.bundleId),
}));

/**
 * Back-in-stock notifications.
 *
 * `notifiedAt` rather than deleting the row: a shopper who was told once should
 * not be told again on the next restock, and the record of having told them is
 * what prevents it.
 */
export const stockAlerts = pgTable('stock_alerts', {
  id: uuid('id').primaryKey().defaultRandom(),
  variantId: uuid('variant_id').notNull().references(() => productVariants.id, { onDelete: 'cascade' }),
  email: varchar('email', { length: 255 }).notNull(),
  locale: localeEnum('locale').default('ar'),
  notifiedAt: timestamp('notified_at'),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  variantIdx: index('stock_alerts_variant_idx').on(table.variantId),
  // One outstanding request per address per variant.
  oneOutstanding: uniqueIndex('stock_alerts_variant_email_idx').on(table.variantId, table.email),
}));

export const productReviewsRelations = relations(productReviews, ({ one }) => ({
  product: one(products, { fields: [productReviews.productId], references: [products.id] }),
}));

export const productBundlesRelations = relations(productBundles, ({ many }) => ({
  items: many(bundleItems),
}));

export const bundleItemsRelations = relations(bundleItems, ({ one }) => ({
  bundle: one(productBundles, { fields: [bundleItems.bundleId], references: [productBundles.id] }),
  variant: one(productVariants, { fields: [bundleItems.variantId], references: [productVariants.id] }),
}));

// ─── FORM SUBMISSIONS ─────────────────────────────────────
