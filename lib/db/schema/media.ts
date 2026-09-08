// lib/db/schema/media.ts
import {
  pgTable, uuid, varchar, text, integer, boolean,
  timestamp, jsonb, index, uniqueIndex, primaryKey
} from 'drizzle-orm/pg-core';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './auth';

// ─── MEDIA ──────────────────────────────────────────────

/**
 * Media folders — organisation only, never a way to lose a file.
 *
 * One level of nesting, matching categories. `path` is a denormalised
 * breadcrumb rebuilt on every write rather than patched: with two levels it is
 * cheap, and a path that disagrees with `parent_id` is the classic way this
 * kind of column rots.
 *
 * Deleting a folder moves its assets to the root and promotes its children —
 * deliberately NOT a cascade, which would turn "tidy up my folders" into a way
 * to destroy uploads.
 */
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
