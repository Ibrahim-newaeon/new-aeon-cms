// app/(site)/[locale]/[segment]/[slug]/page.tsx
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { content, contentI18n, contentTypes } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { ContentRenderer } from '@/components/site/content-renderer';
import { asContentBlocks } from '@/lib/blocks/content-schema';
import { typeByPrefix } from '@/lib/content/types-admin';
import { locales, type Locale } from '@/lib/env';

interface Params {
  params: Promise<{ locale: string; segment: string; slug: string }>;
}

/**
 * An entry of an admin-created content type: /ar/case-studies/acme.
 *
 * This route is what made the content-type builder possible. `content_types`
 * always accepted new rows, but /[locale]/[slug] catches every bare path, so a
 * new type had rows, an editor, and nowhere to live.
 *
 * The least specific route on the site. Next matches static segments first, so
 * /shop, /products and the rest resolve before this runs — which is exactly why
 * a type may not claim one of those words as its address.
 */
async function load(localeParam: string, prefix: string, slug: string) {
  if (!locales.includes(localeParam as Locale)) return null;
  const locale = localeParam as Locale;

  const type = await typeByPrefix(prefix);
  if (!type) return null;

  const [row] = await db
    .select({
      status: content.status,
      title: contentI18n.title,
      excerpt: contentI18n.excerpt,
      body: contentI18n.body,
      metaTitle: contentI18n.metaTitle,
      metaDescription: contentI18n.metaDescription,
      ogImage: contentI18n.ogImage,
      noIndex: contentI18n.noIndex,
    })
    .from(content)
    .innerJoin(contentTypes, eq(contentTypes.id, content.typeId))
    // LEFT JOIN, matching how the rest of the site treats a missing
    // translation: the entry resolves rather than 404ing.
    .leftJoin(
      contentI18n,
      and(eq(contentI18n.contentId, content.id), eq(contentI18n.locale, locale))
    )
    .where(and(eq(content.slug, slug), eq(contentTypes.id, type.id)))
    .limit(1);

  // Drafts and archived entries must not be reachable by guessing a URL.
  if (!row || row.status !== 'published') return null;
  return { row, locale };
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale, segment, slug } = await params;
  const loaded = await load(locale, segment, slug);
  if (!loaded) return {};

  const { row } = loaded;
  return {
    title: row.metaTitle || row.title || slug,
    description: row.metaDescription || row.excerpt || undefined,
    robots: row.noIndex ? { index: false, follow: false } : undefined,
    openGraph: row.ogImage ? { images: [row.ogImage] } : undefined,
  };
}

export default async function CustomTypeEntry({ params }: Params) {
  const { locale, segment, slug } = await params;
  const loaded = await load(locale, segment, slug);
  if (!loaded) notFound();

  const { row } = loaded;

  return (
    <article className="mx-auto max-w-4xl px-4 py-16" data-test-id="type-entry">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-site-ink">{row.title ?? slug}</h1>
        {row.excerpt && <p className="mt-2 text-site-ink-muted">{row.excerpt}</p>}
      </header>
      <ContentRenderer blocks={asContentBlocks(row.body)} locale={loaded.locale} />
    </article>
  );
}
