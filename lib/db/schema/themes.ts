// lib/db/schema/themes.ts
import {
  pgTable, uuid, varchar, text, integer, boolean,
  timestamp, jsonb, index, uniqueIndex, primaryKey
} from 'drizzle-orm/pg-core';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// ─── HTML THEME PACKS ─────────────────────────────────────
/**
 * Uploaded HTML theme zips (marketing storefront). Files live under
 * THEMES_DIR/{id}/; this row is the catalogue + active flag.
 */
export const themes = pgTable('themes', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 100 }).notNull(),
  version: varchar('version', { length: 32 }).notNull(),
  /** Parsed theme.json */
  manifest: jsonb('manifest').notNull(),
  isActive: boolean('is_active').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});
