// lib/backup/tables.ts

/**
 * What goes into a backup, decided table by table.
 *
 * An allow-list, not "dump everything". A backup is a file that leaves the
 * server and lands in someone's downloads folder, so the question for each
 * table is not "is it ours" but "should it be in that file". Getting it wrong
 * in the generous direction puts live session tokens in an email attachment.
 *
 * The list is explicit so a table added later is absent until somebody
 * decides — which is the safe default. tests/backup.test.ts fails when a
 * table exists in the schema and appears in neither list.
 */

/** The client's own data. This is what "you are not locked in" means. */
export const BACKUP_TABLES = [
  // Content
  'content_types',
  'content',
  'content_i18n',
  'content_categories',
  'content_tags',
  'categories',
  'category_i18n',
  'tags',
  'tag_i18n',
  'navigation',
  'navigation_i18n',

  // Catalogue
  'brands',
  'products',
  'product_i18n',
  'product_categories',
  'product_variants',
  'variant_option_values',
  'product_options',
  'product_images',
  'product_specs',
  'product_bundles',
  'bundle_items',

  // Trade
  'orders',
  'order_items',
  'order_status_history',
  'customers',
  'customer_addresses',
  'wishlist_items',
  'coupons',
  'shipping_zones',
  'product_reviews',
  'stock_alerts',

  // Site
  'media_folders',
  'media_assets',
  'settings',
  'form_submissions',
  'audit_log',
  'users',
] as const;

/**
 * Deliberately left out, with the reason. Every one of these is either a live
 * credential or a value that means nothing outside the machine that made it.
 */
export const EXCLUDED_TABLES: Record<string, string> = {
  refresh_tokens: 'Live session tokens. A backup containing these is a set of working logins.',
  password_reset_tokens: 'Live single-use secrets, valid for minutes.',
  customer_otp: 'Live sign-in codes. Anyone holding the file could use one before it expires.',
  customer_carts: 'A shopper mid-browse. Restoring it would resurrect abandoned carts as real ones.',
};

/**
 * Columns dropped from otherwise-included tables.
 *
 * `users.password_hash` is the only one, and it is dropped on purpose: a
 * backup is copied, emailed and left on laptops, and a file of password hashes
 * is worth attacking. Restoring a backup therefore re-creates the accounts but
 * not their passwords — staff sign in again through password reset, which is a
 * small cost against not scattering hashes.
 */
export const REDACTED_COLUMNS: Record<string, readonly string[]> = {
  users: ['password_hash'],
};

export type BackupTable = (typeof BACKUP_TABLES)[number];
