// app/(site)/[locale]/[segment]/page.tsx
import type { Metadata } from 'next';

import { getContentBySlug } from '@/lib/db/queries';
import { ContentRenderer } from '@/components/site/content-renderer';
import { asContentBlocks } from '@/lib/blocks/content-schema';
import { buildMetadata } from '@/lib/seo/metadata';
import { getDefaultLocale } from '@/lib/default-locale';
import { getSettings } from '@/lib/db/queries';
import { locales, type Locale } from '@/lib/env';
import { TypeArchive, archiveMetadata } from './type-archive';

interface Params {
  params: Promise<{ locale: string; segment: string }>;
}

/**
 * One segment under a locale, which can be two different things.
 *
 * A published page at that slug, or the index of an admin-created content type
 * whose address is that word. Both live here because Next allows only ONE
 * dynamic name per path level — a sibling [prefix] beside [slug] is a build
 * error, not a routing choice.
 *
 * A page wins when both exist. It is the older meaning of the URL and the one
 * that may already be linked; a type whose archive would be shadowed is
 * refused at creation time instead, where the person can still do something
 * about it.
 */
async function load(localeParam: string, segment: string) {
  if (!locales.includes(localeParam as Locale)) return null;
  const locale = localeParam as Locale;

  const record = await getContentBySlug(segment, locale);

  // Drafts and archived content must not be reachable by URL guessing.
  if (!record || record.content.status !== 'published') return null;

  return { record, locale };
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale, segment } = await params;
  const loaded = await load(locale, segment);
  if (!loaded) return archiveMetadata(locale, segment);

  const { i18n } = loaded.record;
  const settings = await getSettings();

  return buildMetadata({
    defaultLocale: await getDefaultLocale(),
    locale: loaded.locale,
    path: `/${segment}`,
    title: i18n?.metaTitle || i18n?.title || segment,
    description: i18n?.metaDescription || i18n?.excerpt,
    image: i18n?.ogImage ?? settings?.logo,
    // Editorial content, so a share renders as an article rather than a site.
    type: 'article',
    noIndex: i18n?.noIndex ?? false,
    siteName: settings?.siteName,
  });
}

export default async function ContentPage({ params }: Params) {
  const { locale, segment } = await params;
  const loaded = await load(locale, segment);

  // No page by that slug — it may be a content type's index instead.
  if (!loaded) return <TypeArchive locale={locale} prefix={segment} />;

  const { i18n } = loaded.record;

  return (
    <article className="mx-auto max-w-4xl px-4 py-16">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-site-ink">{i18n?.title ?? segment}</h1>
        {i18n?.excerpt && <p className="mt-2 text-lg text-site-ink-muted">{i18n.excerpt}</p>}
      </header>

      <ContentRenderer blocks={asContentBlocks(i18n?.body)} locale={loaded.locale} />
    </article>
  );
}
