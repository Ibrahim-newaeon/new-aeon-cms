// lib/db/schema/auth.ts
import {
  pgTable, uuid, varchar, text, integer, boolean,
  timestamp, jsonb, index, uniqueIndex, primaryKey
} from 'drizzle-orm/pg-core';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { userRoleEnum } from './enums';

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

/**
 * Self-service password reset.
 *
 * Stores a HASH of the token, never the token. A leaked database dump must not
 * be a set of working reset links — the same reasoning that applies to
 * users.password_hash, and the reason `token_hash` is unique rather than the
 * token being looked up directly.
 */
export const passwordResetTokens = pgTable('password_reset_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: varchar('token_hash', { length: 255 }).notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  /** Set when redeemed. Single-use is enforced on this, not on deletion. */
  usedAt: timestamp('used_at'),
  requestedIp: varchar('requested_ip', { length: 45 }),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  userIdx: index('password_reset_tokens_user_idx').on(table.userId),
}));
