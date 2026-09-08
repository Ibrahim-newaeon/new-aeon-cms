// lib/db/schema/forms.ts
import {
  pgTable, uuid, varchar, text, integer, boolean,
  timestamp, jsonb, index, uniqueIndex, primaryKey
} from 'drizzle-orm/pg-core';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { formTypeEnum, localeEnum } from './enums';

export const formSubmissions = pgTable('form_submissions', {
  id: uuid('id').primaryKey().defaultRandom(),
  type: formTypeEnum('type').notNull(),
  payload: jsonb('payload').$type<Record<string, string>>().notNull(),
  pageSlug: varchar('page_slug', { length: 255 }),
  locale: localeEnum('locale'),
  ipAddress: varchar('ip_address', { length: 45 }),
  userAgent: text('user_agent'),
  isRead: boolean('is_read').default(false),
  /**
   * Archived, not deleted. A handled enquiry leaves the queue but stays
   * readable — deleting is a separate, explicit action.
   */
  archivedAt: timestamp('archived_at'),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  typeCreatedIdx: index('form_submissions_type_created_idx').on(table.type, table.createdAt),
}));

