// app/(site)/[locale]/[segment]/type-archive.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { content, contentI18n, contentTypes } from '@/lib/db/schema';
import { and, desc, eq } from 'drizzle-orm';
import { typeByPrefix } from '@/lib/content/types-admin';
import { locales, type Locale } from '@/lib/env';

/**
 * The index of an admin-created content type.
 *
 * Reached only when no published page owns the segment, so a page always wins
 * the URL. Not its own route file: Next permits one dynamic name per path
 * level, and [prefix] beside [slug] is a build error.
 */
async function load(localeParam: string, prefix: string) {
  if (!locales.includes(localeParam as Locale)) return null;
  const locale = localeParam as Locale;

  const type = await typeByPrefix(prefix);
  // hasArchive false means the entries exist but the index does not — a type
  // whose pages are linked from elsewhere rather than listed.
  if (!type || type.hasArchive === false) return null;

  const entries = await db
    .select({
      slug: content.slug,
      title: contentI18n.title,
      excerpt: contentI18n.excerpt,
    })
    .from(content)
    .innerJoin(contentTypes, eq(contentTypes.id, content.typeId))
    .leftJoin(
      contentI18n,
      and(eq(contentI18n.contentId, content.id), eq(contentI18n.locale, locale))
    )
    .where(and(eq(contentTypes.id, type.id), eq(content.status, 'published')))
    .orderBy(desc(content.publishedAt))
    .limit(60);

  return { type, entries, locale };
}

export async function archiveMetadata(locale: string, prefix: string): Promise<Metadata> {
  const loaded = await load(locale, prefix);
  return loaded ? { title: loaded.type.name } : {};
}

export async function TypeArchive({ locale, prefix }: { locale: string; prefix: string }) {
  const loaded = await load(locale, prefix);
  if (!loaded) notFound();

  const { type, entries } = loaded;
  const ar = loaded.locale === 'ar';

  return (
    <div className="mx-auto max-w-4xl px-4 py-16">
      <h1 className="mb-8 text-3xl font-bold text-site-ink">{type.name}</h1>

      {entries.length === 0 ? (
        <p className="text-sm text-site-ink-muted" data-test-id="type-archive-empty">
          {ar ? 'لا يوجد محتوى منشور بعد.' : 'Nothing published yet.'}
        </p>
      ) : (
        <ul className="flex flex-col gap-3" data-test-id="type-archive">
          {entries.map((entry) => (
            <li key={entry.slug}>
              <Link
                href={`/${loaded.locale}/${type.routePrefix}/${entry.slug}`}
                className="block rounded-lg border border-site-line p-4 transition-colors hover:bg-site-surface-raised"
              >
                <h2 className="font-semibold text-site-ink">{entry.title ?? entry.slug}</h2>
                {entry.excerpt && (
                  <p className="mt-1 line-clamp-2 text-sm text-site-ink-muted">{entry.excerpt}</p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
