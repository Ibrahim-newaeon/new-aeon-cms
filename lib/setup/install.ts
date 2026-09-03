// lib/setup/install.ts
import 'server-only';
import { z } from 'zod';
import { db } from '@/lib/db';
import { users, settings, contentTypes } from '@/lib/db/schema';
import { hashPassword } from '@/lib/auth/password';
import { eq, sql } from 'drizzle-orm';
import { markInstalled } from './status';
import { installDemoContent } from './demo';
import { installStarterContent } from './starter';
import { regionsFor } from './regions';

/**
 * The one-time install performed by the setup wizard.
 *
 * ── The security property ───────────────────────────────────────────────────
 * This is reachable WITHOUT authentication — it has to be, since its whole
 * purpose is creating the first account. That makes "it can only ever run
 * once" the single thing standing between a fresh deploy and a stranger owning
 * the CMS.
 *
 * The guard is therefore not a read-then-write. Checking "are there admins?"
 * and inserting afterwards leaves a window in which two simultaneous requests
 * both see zero and both create an owner. Instead the insert is conditional in
 * SQL — `insert … select … where not exists (select 1 from users where role =
 * 'admin')` — so the database decides, atomically, and the loser inserts
 * nothing. rowCount tells us which one we were.
 */

export const setupSchema = z.object({
  siteName: z.string().trim().min(1, 'Site name is required').max(255),
  name: z.string().trim().min(1, 'Your name is required').max(255),
  email: z.string().trim().toLowerCase().email('Enter a valid email').max(255),
  // 12, not 8: this account can publish, export every customer, and change
  // billing-adjacent settings. It is the highest-value password in the system.
  password: z.string().min(12, 'Use at least 12 characters').max(200),
  defaultLocale: z.enum(['ar', 'en']),
  /**
   * Drives phone parsing, and therefore the key customers are merged on. Not
   * an ISO free-for-all: only the codes the wizard offers, so an unchecked
   * string cannot reach libphonenumber.
   */
  countryCode: z.string().trim().toUpperCase().length(2),
  currency: z.string().trim().toUpperCase().length(3).regex(/^[A-Z]{3}$/, 'Use an ISO code such as JOD'),
  commerce: z.boolean(),
  demoContent: z.boolean(),
});

export type SetupInput = z.infer<typeof setupSchema>;

export type InstallResult =
  | {
      ok: true;
      userId: string;
      demo: { products: number } | null;
      starter: { home: boolean; legal: number };
    }
  | { ok: false; reason: 'already-installed' };

export async function install(input: SetupInput): Promise<InstallResult> {
  const passwordHash = await hashPassword(input.password);

  /**
   * Conditional insert. Returns no row when an admin already exists, which is
   * the race-safe version of "refuse if already set up".
   */
  const created = await db.execute<{ id: string }>(sql`
    insert into users (email, password_hash, name, role, is_active)
    select ${input.email}, ${passwordHash}, ${input.name}, 'admin', true
    where not exists (select 1 from users where role = 'admin')
    returning id
  `);

  const userId = created.rows?.[0]?.id;
  if (!userId) return { ok: false, reason: 'already-installed' };

  // Only after we know we won the race is anything else written.
  markInstalled();

  /**
   * `defaultLocale` and `shippingRegions` are written here for the same reason
   * country and currency are: the wizard already asks, and until now the
   * answers went nowhere. Language fell back to the DEFAULT_LOCALE env var, so
   * choosing English produced an Arabic site; regions fell back to Jordan's
   * governorates, so a shop in Riyadh offered delivery to Amman.
   */
  const values = {
    siteName: input.siteName,
    eCommerceEnabled: input.commerce,
    countryCode: input.countryCode,
    currency: input.currency,
    defaultLocale: input.defaultLocale,
    shippingRegions: regionsFor(input.countryCode),
  };

  await db
    .insert(settings)
    .values({ id: 1, ...values })
    .onConflictDoUpdate({ target: settings.id, set: values });

  // The built-in types own hand-built screens and routes; without these rows
  // those screens have nothing to attach content to.
  for (const [slug, name, archive, prefix] of [
    ['page', 'Page', false, null],
    ['post', 'Post', true, 'blog'],
    ['resource', 'Resource', true, 'resources'],
  ] as const) {
    await db
      .insert(contentTypes)
      .values({
        slug, name,
        hasArchive: archive, hasCategories: archive, hasTags: archive,
        hasFeaturedImage: true, isActive: true, isBuiltIn: true,
        routePrefix: prefix,
      })
      .onConflictDoUpdate({ target: contentTypes.slug, set: { isBuiltIn: true } });
  }

  /**
   * Runs for every install, demo content or not. Without it the site has
   * content types and no content, and the storefront falls back to a hero
   * reading "New Aeon" — a client's homepage carrying the CMS's own name.
   */
  const starter = await installStarterContent({
    siteName: input.siteName,
    authorId: userId,
  });

  let demo: { products: number } | null = null;
  if (input.demoContent) {
    // Commerce demo content on a site with the shop switched off would create
    // products nobody can reach, so it follows the commerce choice.
    const result = await installDemoContent({
      countryCode: input.countryCode,
      currency: input.currency,
    });
    demo = { products: result.products };
  }

  return { ok: true, userId, demo, starter };
}

/** Whether an administrator exists, read fresh — used to close the wizard. */
export async function adminExists(): Promise<boolean> {
  const [row] = await db.select({ id: users.id }).from(users).where(eq(users.role, 'admin')).limit(1);
  return Boolean(row);
}
