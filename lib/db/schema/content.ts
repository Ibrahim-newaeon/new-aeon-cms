// lib/db/schema/content.ts
import {
  pgTable, uuid, varchar, text, integer, boolean,
  timestamp, jsonb, index, uniqueIndex, primaryKey
} from 'drizzle-orm/pg-core';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { contentStatusEnum, localeEnum } from './enums';
import { users } from './auth';
import { mediaAssets } from './media';
import type { ContentBlock } from '../../blocks/types';

export const contentTypes = pgTable('content_types', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: varchar('slug', { length: 255 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  hasArchive: boolean('has_archive').default(true),
  hasCategories: boolean('has_categories').default(true),
  hasTags: boolean('has_tags').default(true),
  hasFeaturedImage: boolean('has_featured_image').default(true),
  /**
   * The URL segment this type's entries live under: /ar/{routePrefix}/{slug}.
   *
   * Null for `page`, whose entries sit at the site root, and for any type with
   * no public presence. Everything else needs one, because /[locale]/[slug]
   * already catches every bare path — which is why the table could hold a
   * "Case study" type that had rows, an editor, and nowhere to live.
   *
   * Validated against the live route segments in lib/content/type-registry.ts.
   * Next resolves a static segment ahead of a dynamic one, so a prefix of
   * "shop" would not break the store; it would silently never resolve.
   */
  routePrefix: varchar('route_prefix', { length: 64 }).unique(),
  /** page/post/resource, which own hand-built screens and cannot be deleted. */
  isBuiltIn: boolean('is_built_in').default(false),
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
  /**
   * Reference name, not a display name.
   *
   * Same arrangement as `navigation.label`: translations live in tag_i18n and
   * this is what renders when a locale has none, so a tag can never appear as a
   * blank chip. Tags were previously (slug, name) only, which meant one
   * language's wording showed on both locales of a bilingual site.
   */
  name: varchar('name', { length: 255 }).notNull(),
});

export const tagI18n = pgTable('tag_i18n', {
  id: uuid('id').primaryKey().defaultRandom(),
  tagId: uuid('tag_id').notNull().references(() => tags.id, { onDelete: 'cascade' }),
  locale: localeEnum('locale').notNull(),
  name: varchar('name', { length: 255 }).notNull(),
}, (table) => ({
  tagLocaleIdx: uniqueIndex('tag_i18n_tag_locale_idx').on(table.tagId, table.locale),
}));

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
