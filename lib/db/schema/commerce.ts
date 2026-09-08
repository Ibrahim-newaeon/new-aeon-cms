// lib/db/schema/commerce.ts
import {
  pgTable, uuid, varchar, text, integer, boolean,
  timestamp, jsonb, index, uniqueIndex, primaryKey
} from 'drizzle-orm/pg-core';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { couponTypeEnum, localeEnum, orderStatusEnum, paymentMethodEnum, paymentStatusEnum } from './enums';
import { mediaAssets } from './media';
import { categories } from './content';
import { users } from './auth';

// ─── E-COMMERCE MODULE (Optional) ────────────────────────

export const brands = pgTable('brands', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: varchar('slug', { length: 255 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  logoUrl: text('logo_url'),
  isAuthorizedDealer: boolean('is_authorized_dealer').default(false),
  sortOrder: integer('sort_order').default(0),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
});

export const products = pgTable('products', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: varchar('slug', { length: 255 }).notNull(),
  brandId: uuid('brand_id').references(() => brands.id),
  basePrice: integer('base_price').notNull(),
  compareAtPrice: integer('compare_at_price'),
  isActive: boolean('is_active').default(true),
  sortOrder: integer('sort_order').default(0),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const productI18n = pgTable('product_i18n', {
  id: uuid('id').primaryKey().defaultRandom(),
  productId: uuid('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  locale: localeEnum('locale').notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  shortDesc: text('short_description'),
  description: text('description'),
  metaTitle: varchar('meta_title', { length: 255 }),
  metaDescription: text('meta_description'),
}, (table) => ({
  productLocaleIdx: uniqueIndex('product_i18n_product_locale_idx').on(table.productId, table.locale),
}));

export const productVariants = pgTable('product_variants', {
  id: uuid('id').primaryKey().defaultRandom(),
  productId: uuid('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  sku: varchar('sku', { length: 100 }).notNull().unique(),
  barcode: varchar('barcode', { length: 100 }),
  price: integer('price').notNull(),
  compareAtPrice: integer('compare_at_price'),
  stock: integer('stock').default(0),
  lowStockThreshold: integer('low_stock_threshold').default(5),
  weightGrams: integer('weight_grams'),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
});

/**
 * The axes a product varies on — "Size", "Colour". Declared per product so a
 * generic catalogue is not limited to a fixed set of columns, which is what
 * color/size/capacity/connectorType were.
 */
export const productOptions = pgTable('product_options', {
  id: uuid('id').primaryKey().defaultRandom(),
  productId: uuid('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 100 }).notNull(),
  position: integer('position').default(0),
}, (table) => ({
  productNameIdx: uniqueIndex('product_options_product_name_idx').on(table.productId, table.name),
}));

/** One value per axis, per variant: variant X is Size=50ml, Colour=Gold. */
export const variantOptionValues = pgTable('variant_option_values', {
  variantId: uuid('variant_id').notNull().references(() => productVariants.id, { onDelete: 'cascade' }),
  optionId: uuid('option_id').notNull().references(() => productOptions.id, { onDelete: 'cascade' }),
  value: varchar('value', { length: 255 }).notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.variantId, table.optionId] }),
}));

/**
 * Products <-> categories.
 *
 * This replaced a single `products.category_id`. A real catalogue does not fit
 * it: the imported Juman range put products in up to four categories at once
 * ("perfumes" AND "women" AND "gifts"), so importing it kept the first and
 * silently dropped 50 assignments — which is why two categories ended up
 * holding 50 of 52 products and two more held none.
 *
 * `isPrimary` marks the one category that owns the product's breadcrumb and
 * canonical /shop/[category] URL. Exactly one per product, enforced by a
 * partial unique index rather than by convention, because "the first row" is
 * not a thing a table guarantees.
 */
export const productCategories = pgTable('product_categories', {
  productId: uuid('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  categoryId: uuid('category_id').notNull().references(() => categories.id, { onDelete: 'cascade' }),
  isPrimary: boolean('is_primary').notNull().default(false),
}, (table) => ({
  pk: primaryKey({ columns: [table.productId, table.categoryId] }),
  categoryIdx: index('product_categories_category_idx').on(table.categoryId),
  onePrimary: uniqueIndex('product_categories_one_primary_idx')
    .on(table.productId)
    .where(sql`is_primary`),
}));

export const productImages = pgTable('product_images', {
  id: uuid('id').primaryKey().defaultRandom(),
  productId: uuid('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  variantId: uuid('variant_id').references(() => productVariants.id),
  url: text('url').notNull(),
  alt: varchar('alt', { length: 255 }),
  sortOrder: integer('sort_order').default(0),
  createdAt: timestamp('created_at').defaultNow(),
});

export const productSpecs = pgTable('product_specs', {
  id: uuid('id').primaryKey().defaultRandom(),
  productId: uuid('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  locale: localeEnum('locale').notNull(),
  key: varchar('key', { length: 255 }).notNull(),
  value: text('value').notNull(),
  sortOrder: integer('sort_order').default(0),
});

/**
 * Keyed on phone, not email: this is a cash-on-delivery shop, the courier calls
 * the number, and email is frequently not given. The phone is normalised before
 * lookup (see lib/commerce/phone.ts) so one person cannot become two customers.
 */
export const customers = pgTable('customers', {
  id: uuid('id').primaryKey().defaultRandom(),
  phone: varchar('phone', { length: 32 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  email: varchar('email', { length: 255 }),
  /**
   * Set only once someone REGISTERS. A row created by placing an order has
   * none, which is the difference between "we know this buyer" and "this buyer
   * has an account".
   *
   * Registering against a phone that already has orders therefore hands over
   * that order history — so it requires proving the number by code first. See
   * lib/account/register.ts.
   */
  passwordHash: text('password_hash'),
  registeredAt: timestamp('registered_at'),
  governorate: varchar('governorate', { length: 100 }),
  city: varchar('city', { length: 100 }),
  addressLine: text('address_line'),
  landmark: text('landmark'),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

/**
 * One-time codes for shopper sign-in.
 *
 * Hashed at rest with the same argon2 used for staff passwords. A six-digit
 * code is guessable in a million tries, so what actually protects it is the
 * attempt counter and the short expiry, not the hash — but storing it in clear
 * would mean a read of this table hands over every live session.
 *
 * One row per phone: requesting a new code replaces the old one, so a code
 * read from an SMS is always the current one and an abandoned request cannot
 * be used later.
 */
export const customerOtp = pgTable('customer_otp', {
  phone: varchar('phone', { length: 32 }).primaryKey(),
  codeHash: text('code_hash').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  /** Counted down so a wrong guess costs something. */
  attemptsLeft: integer('attempts_left').notNull().default(5),
  createdAt: timestamp('created_at').defaultNow(),
});

/**
 * A customer's saved addresses.
 *
 * Separate from the address fields on `customers`, which are a snapshot of
 * wherever they last ordered. This is the book they choose from, so retyping a
 * delivery address on every order stops being the default experience.
 */
export const customerAddresses = pgTable('customer_addresses', {
  id: uuid('id').primaryKey().defaultRandom(),
  customerId: uuid('customer_id').notNull().references(() => customers.id, { onDelete: 'cascade' }),
  label: varchar('label', { length: 100 }),
  name: varchar('name', { length: 255 }).notNull(),
  phone: varchar('phone', { length: 32 }).notNull(),
  governorate: varchar('governorate', { length: 100 }).notNull(),
  city: varchar('city', { length: 100 }).notNull(),
  addressLine: text('address_line').notNull(),
  landmark: text('landmark'),
  /** Exactly one per customer, enforced by a partial unique index. */
  isDefault: boolean('is_default').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  customerIdx: index('customer_addresses_customer_idx').on(table.customerId),
  oneDefault: uniqueIndex('customer_addresses_one_default_idx')
    .on(table.customerId)
    .where(sql`is_default`),
}));

/**
 * Saved products.
 *
 * Keyed on the PRODUCT, not a variant: a shopper saves "the amber oud", not
 * "the 50ml in gold". Which variant they want is a decision for the product
 * page, and pinning it here would break the moment that variant is retired.
 */
export const wishlistItems = pgTable('wishlist_items', {
  customerId: uuid('customer_id').notNull().references(() => customers.id, { onDelete: 'cascade' }),
  productId: uuid('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  pk: primaryKey({ columns: [table.customerId, table.productId] }),
  customerIdx: index('wishlist_customer_idx').on(table.customerId),
}));

/**
 * A signed-in shopper's cart, so it survives changing device.
 *
 * The cookie remains the source of truth while browsing — it is what an
 * anonymous visitor has, and reading it costs nothing. This is a mirror,
 * written on change and merged back at sign-in, so a cart built on a phone is
 * still there on a laptop.
 */
export const customerCarts = pgTable('customer_carts', {
  customerId: uuid('customer_id').primaryKey().references(() => customers.id, { onDelete: 'cascade' }),
  lines: jsonb('lines').$type<{ variantId: string; qty: number }[]>().notNull(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const shippingZones = pgTable('shipping_zones', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  governorates: jsonb('governorates').$type<string[]>().notNull(),
  flatRate: integer('flat_rate').notNull(),
  /** Compared against the subtotal AFTER discount. */
  freeOver: integer('free_over'),
  etaDays: integer('eta_days').default(3),
  isActive: boolean('is_active').default(true),
  sortOrder: integer('sort_order').default(0),
});

export const coupons = pgTable('coupons', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: varchar('code', { length: 50 }).notNull().unique(),
  type: couponTypeEnum('type').notNull(),
  /** percent: 1-100. fixed: minor units. */
  value: integer('value').notNull(),
  minSubtotal: integer('min_subtotal').default(0),
  usageLimit: integer('usage_limit'),
  usedCount: integer('used_count').default(0),
  startsAt: timestamp('starts_at'),
  endsAt: timestamp('ends_at'),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
});

export const orders = pgTable('orders', {
  id: uuid('id').primaryKey().defaultRandom(),
  orderNumber: varchar('order_number', { length: 50 }).notNull().unique(),
  /**
   * Idempotency. A UNIQUE constraint is the only reliable guard against a
   * double submit: two concurrent requests both pass an application-level
   * "have I seen this?" check, but only one can win the index.
   */
  idempotencyKey: varchar('idempotency_key', { length: 128 }).unique(),
  status: orderStatusEnum('status').notNull().default('pending'),
  customerId: uuid('customer_id').references(() => customers.id),
  shippingZoneId: uuid('shipping_zone_id').references(() => shippingZones.id),
  subtotal: integer('subtotal').notNull(),
  shipping: integer('shipping').notNull(),
  discount: integer('discount').default(0),
  total: integer('total').notNull(),
  currency: varchar('currency', { length: 3 }).default('JOD'),
  customerName: varchar('customer_name', { length: 255 }).notNull(),
  phone: varchar('phone', { length: 50 }).notNull(),
  email: varchar('email', { length: 255 }),
  governorate: varchar('governorate', { length: 255 }).notNull(),
  city: varchar('city', { length: 255 }).notNull(),
  addressLine: text('address_line').notNull(),
  landmark: text('landmark'),
  paymentMethod: paymentMethodEnum('payment_method').notNull().default('cod'),
  paymentStatus: paymentStatusEnum('payment_status').notNull().default('pending'),
  notes: text('notes'),
  couponCode: varchar('coupon_code', { length: 50 }),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const orderItems = pgTable('order_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  orderId: uuid('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  variantId: uuid('variant_id').notNull().references(() => productVariants.id),
  nameSnapshot: varchar('name_snapshot', { length: 255 }).notNull(),
  skuSnapshot: varchar('sku_snapshot', { length: 100 }).notNull(),
  priceSnapshot: integer('price_snapshot').notNull(),
  qty: integer('qty').notNull(),
});

/** Answers "when did this ship, and who marked it?" — written by C2 at
 *  placement and by the admin in C3. */
export const orderStatusHistory = pgTable('order_status_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  orderId: uuid('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  fromStatus: orderStatusEnum('from_status'),
  toStatus: orderStatusEnum('to_status').notNull(),
  note: text('note'),
  changedBy: uuid('changed_by').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  orderIdx: index('order_status_history_order_idx').on(table.orderId, table.createdAt),
}));
