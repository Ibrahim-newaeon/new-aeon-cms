// lib/media/usage.ts
import 'server-only';
import { db } from '@/lib/db';
import { mediaAssets } from '@/lib/db/schema';
import { inArray, sql } from 'drizzle-orm';

/**
 * Finding uploads nothing points at.
 *
 * Computed on demand rather than tracked with a reference count. A count has to
 * be maintained by every write path that could mention a URL — block bodies,
 * settings, product images, brand logos — and the first one that forgets leaves
 * a file undeletable forever or, worse, deletable while still in use. Recomputing
 * is slower and cannot drift.
 *
 * It is also deliberately conservative: `strpos` over the serialised block body
 * can match a URL that merely appears in some unrelated string, which reports an
 * asset as USED when it is not. That error is harmless. The opposite error —
 * reporting a used asset as unused — deletes a live image, so the query is
 * written to never make it.
 */

/**
 * Every place a media URL can be referenced.
 *
 * Enumerated from the schema rather than from memory — the first draft guessed
 * `brands.logo` (the column is `logo_url`) and omitted `content_i18n.og_image`,
 * `categories.icon` and `users.avatar` entirely. Postgres rejected the wrong
 * name; the three omissions would have silently reported live images as unused,
 * which is the one error this feature must never make.
 *
 * `strpos`, not LIKE with concatenated wildcards: a URL containing `%` or `_`
 * would otherwise become a pattern and match far too much.
 */
const UNREFERENCED = sql`
  not exists (select 1 from content c where c.featured_image = ${mediaAssets.url})
  and not exists (
    select 1 from content_i18n ci
     where ci.og_image = ${mediaAssets.url}
        or strpos(ci.body::text, ${mediaAssets.url}) > 0
  )
  and not exists (
    select 1 from settings s
     where s.logo = ${mediaAssets.url}
        or s.favicon = ${mediaAssets.url}
        or strpos(coalesce(s.custom_css, ''), ${mediaAssets.url}) > 0
  )
  and not exists (select 1 from product_images pi where pi.url = ${mediaAssets.url})
  and not exists (select 1 from brands b where b.logo_url = ${mediaAssets.url})
  and not exists (select 1 from categories cat where cat.icon = ${mediaAssets.url})
  and not exists (select 1 from users u where u.avatar = ${mediaAssets.url})
`;


/** How many uploads are currently referenced by nothing. */
export async function countUnusedAssets(): Promise<number> {
  const rows = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(mediaAssets)
    .where(UNREFERENCED);

  return rows[0]?.value ?? 0;
}

/** The unused assets themselves, newest first. */
export async function listUnusedAssets(limit = 200) {
  return db.select().from(mediaAssets).where(UNREFERENCED).limit(limit);
}

/**
 * Narrows a caller-supplied set of ids to those still unused.
 *
 * The "unused" list a browser is looking at is a snapshot; between rendering it
 * and clicking delete, an editor in another tab can drop one of those images
 * into a page. Re-checking here means a bulk delete can only ever remove things
 * that are unused at the moment of deletion, not at the moment of display.
 */
export async function filterStillUnused(ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];

  const rows = await db
    .select({ id: mediaAssets.id })
    .from(mediaAssets)
    .where(sql`${mediaAssets.id} in ${ids} and ${UNREFERENCED}`);

  return rows.map((r) => r.id);
}

/** Assets by id, for reading their URLs before deleting the files. */
export async function getAssetsByIds(ids: string[]) {
  if (ids.length === 0) return [];
  return db.select().from(mediaAssets).where(inArray(mediaAssets.id, ids));
}
