// lib/db/schema/navigation.ts
import {
  pgTable, uuid, varchar, text, integer, boolean,
  timestamp, jsonb, index, uniqueIndex, primaryKey
} from 'drizzle-orm/pg-core';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { navLocationEnum, localeEnum } from './enums';

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
