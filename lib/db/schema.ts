import { 
  pgTable, uuid, varchar, text, integer, boolean,
  timestamp, jsonb, pgEnum, index, uniqueIndex, primaryKey
} from 'drizzle-orm/pg-core';
// Self-referencing FKs (categories.parentId -> categories.id) are circular, so
// TS cannot infer the callback's return type. AnyPgColumn breaks the cycle.
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import type { ContentBlock } from '../blocks/types';

// Enums
export const userRoleEnum = pgEnum('user_role', ['admin', 'editor', 'author']);
export const contentStatusEnum = pgEnum('content_status', ['draft', 'published', 'archived']);
export const localeEnum = pgEnum('locale', ['ar', 'en']);
export const navLocationEnum = pgEnum('nav_location', ['header', 'footer', 'sidebar', 'mobile']);

// ─── USERS & AUTH ──────────────────────────────────────────

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  role: userRoleEnum('role').default('editor'),
  avatar: text('avatar'),
  isActive: boolean('is_active').default(true),
  lastLoginAt: timestamp('last_login_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  emailIdx: index('users_email_idx').on(table.email),
}));

export const refreshTokens = pgTable('refresh_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  jti: varchar('jti', { length: 255 }).notNull().unique(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at').notNull(),
  revokedAt: timestamp('revoked_at'),
  replacedBy: varchar('replaced_by', { length: 255 }),
  createdAt: timestamp('created_at').defaultNow(),
});

// ─── CONTENT TYPES ─────────────────────────────────────────

export const contentTypes = pgTable('content_types', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: varchar('slug', { length: 255 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  hasArchive: boolean('has_archive').default(true),
  hasCategories: boolean('has_categories').default(true),
  hasTags: boolean('has_tags').default(true),
  hasFeaturedImage: boolean('has_featured_image').default(true),
  customFields: jsonb('custom_fields'),
  isActive: boolean('is_active').default(true),
  sortOrder: integer('sort_order').default(0),
  createdAt: timestamp('created_at').defaultNow(),
});

// ─── CATEGORIES ───────────────────────────────────────────

export const categories = pgTable('categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: varchar('slug', { length: 255 }).notNull(),
  parentId: uuid('parent_id').references((): AnyPgColumn => categories.id),
  icon: text('icon'),
  sortOrder: integer('sort_order').default(0),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  slugIdx: uniqueIndex('categories_slug_idx').on(table.slug),
  parentIdx: index('categories_parent_idx').on(table.parentId),
}));

export const categoryI18n = pgTable('category_i18n', {
  id: uuid('id').primaryKey().defaultRandom(),
  categoryId: uuid('category_id').notNull().references(() => categories.id, { onDelete: 'cascade' }),
  locale: localeEnum('locale').notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
}, (table) => ({
  categoryLocaleIdx: uniqueIndex('category_i18n_category_locale_idx').on(table.categoryId, table.locale),
}));

// ─── CONTENT ─────────────────────────────────────────────

export const content = pgTable('content', {
  id: uuid('id').primaryKey().defaultRandom(),
  typeId: uuid('type_id').references(() => contentTypes.id),
  slug: varchar('slug', { length: 255 }).notNull(),
  authorId: uuid('author_id').references(() => users.id),
  featuredImage: text('featured_image'),
  status: contentStatusEnum('status').default('draft'),
  publishedAt: timestamp('published_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  slugIdx: index('content_slug_idx').on(table.slug),
  statusIdx: index('content_status_idx').on(table.status),
  typeStatusIdx: index('content_type_status_idx').on(table.typeId, table.status),
}));

export const contentI18n = pgTable('content_i18n', {
  id: uuid('id').primaryKey().defaultRandom(),
  contentId: uuid('content_id').notNull().references(() => content.id, { onDelete: 'cascade' }),
  locale: localeEnum('locale').notNull(),
  title: varchar('title', { length: 255 }).notNull(),
  excerpt: text('excerpt'),
  // Canonical block array. NOT a TipTap document — see lib/blocks/types.ts.
  body: jsonb('body').$type<ContentBlock[]>(),
  metaTitle: varchar('meta_title', { length: 255 }),
  metaDescription: text('meta_description'),
  ogImage: text('og_image'),
  noIndex: boolean('no_index').default(false),
}, (table) => ({
  contentLocaleIdx: uniqueIndex('content_i18n_content_locale_idx').on(table.contentId, table.locale),
}));

// ─── TAGS ───────────────────────────────────────────────

export const tags = pgTable('tags', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: varchar('slug', { length: 255 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
});

export const contentTags = pgTable('content_tags', {
  contentId: uuid('content_id').notNull().references(() => content.id, { onDelete: 'cascade' }),
  tagId: uuid('tag_id').notNull().references(() => tags.id, { onDelete: 'cascade' }),
}, (table) => ({
  pk: primaryKey({ columns: [table.contentId, table.tagId] }),
}));

// Content <-> categories. `contentTypes.hasCategories` implied this existed,
// but nothing linked the two: only products referenced categories, so a
// category archive could never contain an article. Many-to-many, mirroring
// contentTags.
export const contentCategories = pgTable('content_categories', {
  contentId: uuid('content_id').notNull().references(() => content.id, { onDelete: 'cascade' }),
  categoryId: uuid('category_id').notNull().references(() => categories.id, { onDelete: 'cascade' }),
}, (table) => ({
  pk: primaryKey({ columns: [table.contentId, table.categoryId] }),
}));

// ─── MEDIA ──────────────────────────────────────────────

export const mediaFolders = pgTable('media_folders', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  parentId: uuid('parent_id').references((): AnyPgColumn => mediaFolders.id),
  path: text('path').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const mediaAssets = pgTable('media_assets', {
  id: uuid('id').primaryKey().defaultRandom(),
  filename: varchar('filename', { length: 255 }).notNull(),
  originalName: varchar('original_name', { length: 255 }).notNull(),
  mimeType: varchar('mime_type', { length: 100 }).notNull(),
  size: integer('size').notNull(),
  url: text('url').notNull(),
  thumbnailUrl: text('thumbnail_url'),
  width: integer('width'),
  height: integer('height'),
  altText: varchar('alt_text', { length: 255 }),
  folderId: uuid('folder_id').references((): AnyPgColumn => mediaFolders.id),
  uploadedBy: uuid('uploaded_by').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow(),
});

// ─── NAVIGATION ───────────────────────────────────────────

export const navigation = pgTable('navigation', {
  id: uuid('id').primaryKey().defaultRandom(),
  label: varchar('label', { length: 255 }).notNull(),
  url: varchar('url', { length: 500 }).notNull(),
  order: integer('order').default(0),
  parentId: uuid('parent_id').references((): AnyPgColumn => navigation.id),
  location: navLocationEnum('location').default('header'),
  isActive: boolean('is_active').default(true),
  openInNew: boolean('open_in_new').default(false),
  createdAt: timestamp('created_at').defaultNow(),
});

// Per-locale menu labels. `navigation.label` stays as the fallback/reference
// name so a menu item is never label-less; this table overrides it per locale.
export const navigationI18n = pgTable('navigation_i18n', {
  id: uuid('id').primaryKey().defaultRandom(),
  navigationId: uuid('navigation_id').notNull().references(() => navigation.id, { onDelete: 'cascade' }),
  locale: localeEnum('locale').notNull(),
  label: varchar('label', { length: 255 }).notNull(),
}, (table) => ({
  navLocaleIdx: uniqueIndex('navigation_i18n_nav_locale_idx').on(table.navigationId, table.locale),
}));

// ─── SETTINGS ─────────────────────────────────────────────

export const settings = pgTable('settings', {
  id: integer('id').primaryKey().default(1),
  siteName: varchar('site_name', { length: 255 }).default('New Aeon'),
  siteDescription: text('site_description'),
  logo: text('logo'),
  favicon: text('favicon'),
  contactEmail: varchar('contact_email', { length: 255 }),
  contactPhone: varchar('contact_phone', { length: 50 }),
  socialLinks: jsonb('social_links'),
  analyticsId: varchar('analytics_id', { length: 255 }),
  gtmId: varchar('gtm_id', { length: 255 }),
  ga4Id: varchar('ga4_id', { length: 255 }),
  metaPixelId: varchar('meta_pixel_id', { length: 255 }),
  tiktokPixelId: varchar('tiktok_pixel_id', { length: 255 }),
  snapPixelId: varchar('snap_pixel_id', { length: 255 }),
  customCss: text('custom_css'),
  comingSoonMode: boolean('coming_soon_mode').default(false),
  comingSoonMessage: text('coming_soon_message'),
  eCommerceEnabled: boolean('ecommerce_enabled').default(false),
  currency: varchar('currency', { length: 3 }).default('JOD'),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// ─── AUDIT LOG ────────────────────────────────────────────

export const auditLog = pgTable('audit_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id),
  action: varchar('action', { length: 100 }).notNull(),
  entityType: varchar('entity_type', { length: 50 }).notNull(),
  entityId: varchar('entity_id', { length: 255 }),
  payload: jsonb('payload'),
  ipAddress: varchar('ip_address', { length: 45 }),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at').defaultNow(),
});

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
  categoryId: uuid('category_id').references((): AnyPgColumn => categories.id),
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

export const orders = pgTable('orders', {
  id: uuid('id').primaryKey().defaultRandom(),
  orderNumber: varchar('order_number', { length: 50 }).notNull().unique(),
  status: varchar('status', { length: 50 }).default('pending'),
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
  paymentMethod: varchar('payment_method', { length: 50 }).default('cod'),
  paymentStatus: varchar('payment_status', { length: 50 }).default('pending'),
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

// ─── RELATIONS ───────────────────────────────────────────

export const usersRelations = relations(users, ({ many }) => ({
  content: many(content),
  refreshTokens: many(refreshTokens),
}));

export const contentTypesRelations = relations(contentTypes, ({ many }) => ({
  content: many(content),
}));

export const contentRelations = relations(content, ({ one, many }) => ({
  type: one(contentTypes, { fields: [content.typeId], references: [contentTypes.id] }),
  author: one(users, { fields: [content.authorId], references: [users.id] }),
  i18n: many(contentI18n),
  tags: many(contentTags),
}));

export const categoriesRelations = relations(categories, ({ one, many }) => ({
  parent: one(categories, { fields: [categories.parentId], references: [categories.id] }),
  children: many(categories),
  i18n: many(categoryI18n),
}));

export const tagsRelations = relations(tags, ({ many }) => ({
  content: many(contentTags),
}));

export const mediaFoldersRelations = relations(mediaFolders, ({ one, many }) => ({
  parent: one(mediaFolders, { fields: [mediaFolders.parentId], references: [mediaFolders.id] }),
  children: many(mediaFolders),
  assets: many(mediaAssets),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
  brand: one(brands, { fields: [products.brandId], references: [brands.id] }),
  category: one(categories, { fields: [products.categoryId], references: [categories.id] }),
  i18n: many(productI18n),
  variants: many(productVariants),
  images: many(productImages),
  specs: many(productSpecs),
}));

export const productVariantsRelations = relations(productVariants, ({ one, many }) => ({
  product: one(products, { fields: [productVariants.productId], references: [products.id] }),
  images: many(productImages),
  orderItems: many(orderItems),
}));

export const ordersRelations = relations(orders, ({ many }) => ({
  items: many(orderItems),
}));

// ─── FORM SUBMISSIONS ─────────────────────────────────────
// Backs the contact-form and newsletter blocks. Payload is jsonb because the
// field set is author-configurable per block.

export const formTypeEnum = pgEnum('form_type', ['contact', 'newsletter']);

export const formSubmissions = pgTable('form_submissions', {
  id: uuid('id').primaryKey().defaultRandom(),
  type: formTypeEnum('type').notNull(),
  payload: jsonb('payload').$type<Record<string, string>>().notNull(),
  pageSlug: varchar('page_slug', { length: 255 }),
  locale: localeEnum('locale'),
  ipAddress: varchar('ip_address', { length: 45 }),
  userAgent: text('user_agent'),
  isRead: boolean('is_read').default(false),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  typeCreatedIdx: index('form_submissions_type_created_idx').on(table.type, table.createdAt),
}));
