// app/llms.txt/route.ts
import { db } from '@/lib/db';
import { sql } from 'drizzle-orm';
import { getDefaultLocale } from '@/lib/default-locale';
import { getSettings } from '@/lib/db/queries';
import { commerceEnabled } from '@/lib/commerce/guard';
import { absoluteUrl } from '@/lib/seo/json-ld';
import { buildLlmsTxt } from '@/lib/seo/llms';
import { locales } from '@/lib/env';

export const runtime = 'nodejs';

/**
 * /llms.txt — the same idea as robots.txt, for language models.
 *
 * This route only GATHERS; the document itself is built by buildLlmsTxt, which
 * is a pure function so the rules that matter — drafts excluded, real slugs
 * used — can be tested directly rather than through an hour-long ISR cache.
 *
 * Regenerated hourly, matching the sitemap: it changes when Settings change,
 * which is rarely.
 */
/**
 * Rendered per request, NOT prerendered at build.
 *
 * With only `revalidate` set and no dynamic API, Next treats this as static and
 * runs it during `next build` — which means the BUILD needs a reachable
 * database. That is false everywhere the database is not the developer's own:
 * the Docker build has only a placeholder DATABASE_URL, and the first Railway
 * deploy died here with ENOTFOUND postgres.railway.internal.
 *
 * Nothing is lost by rendering on demand. The response already carries
 * `Cache-Control: public, max-age=3600`, so crawlers and any CDN cache it for
 * the same hour ISR would have; the difference is only WHERE the hour is
 * counted. What is gained is that the image builds anywhere, with no
 * infrastructure — which is what makes CI and a cold deploy possible at all.
 */
export const dynamic = 'force-dynamic';

/** Published pages only, so nothing here points at a draft or a 404. */
async function publishedPages(): Promise<Set<string>> {
  const rows = await db.execute<{ slug: string }>(sql`
    select c.slug
    from content c
    join content_types ct on ct.id = c.type_id
    where ct.slug = 'page' and c.status = 'published'
  `);
  return new Set((rows.rows ?? []).map((r) => r.slug));
}

/** "ar" -> "Arabic", "JO" -> "Jordan". Falls back to the code, never guesses. */
const displayName = (type: 'language' | 'region') => (code: string) => {
  try {
    return new Intl.DisplayNames(['en'], { type }).of(code) ?? code;
  } catch {
    return code;
  }
};

export async function GET() {
  const [settings, shop, pages, primary] = await Promise.all([
    getSettings(),
    commerceEnabled(),
    publishedPages(),
    getDefaultLocale(),
  ]);

  const body = buildLlmsTxt({
    name: settings?.siteName ?? 'Site',
    answer: settings?.brandAnswer ?? settings?.siteDescription ?? null,
    shop,
    primary,
    others: locales.filter((l) => l !== primary),
    pages,
    country: settings?.countryCode ? displayName('region')(settings.countryCode) : null,
    currency: settings?.currency ?? null,
    contactPhone: settings?.contactPhone ?? null,
    whatsappNumber: settings?.whatsappNumber ?? null,
    contactEmail: settings?.contactEmail ?? null,
    social: (settings?.socialLinks ?? null) as Record<string, string> | null,
    allowAiCrawlers: settings?.allowAiCrawlers ?? null,
    url: absoluteUrl,
    languageName: displayName('language'),
  });

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
