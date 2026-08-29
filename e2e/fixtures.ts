// e2e/fixtures.ts
import { Client } from 'pg';

/**
 * Shared constants and the small amount of direct database access the browser
 * suite needs.
 *
 * Reading the database in a test is normally a smell — it lets a test pass
 * against state the user could never produce. It is used here only to *prepare*
 * fixtures (top up stock so a checkout spec can run twice) and to assert on
 * things the UI genuinely does not show, like which stock row was decremented.
 */
export const ADMIN_EMAIL = 'admin@newaeon.com';
export const ADMIN_PASSWORD = 'admin123456';
export const ADMIN_PATH = process.env.ADMIN_PATH || '/admin';

/** The seeded product. Only translated to `en`, so commerce specs use /en. */
export const PRODUCT_SLUG = 'amber-oud';
export const SHOP_LOCALE = 'en';

export const STORAGE_STATE = 'e2e/.auth/admin.json';

export async function withDb<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required to run the browser suite');

  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

/** A slug unique per run, so a spec can be run repeatedly without colliding. */
export function uniqueSlug(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4).toString(36)}`;
}
