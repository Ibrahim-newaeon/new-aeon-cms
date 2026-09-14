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
import { blocksRequestBlankChrome } from '@/lib/blocks/html-paste';
import { tryRenderThemePack } from '@/lib/themes/present';
import { ThemePackView } from '@/components/site/theme-pack-view';
import { JsonLd } from '@/components/site/json-ld';
import { contentPageJsonLd, breadcrumbJsonLd, faqJsonLd } from '@/lib/seo/json-ld';
import { contentKindForTypeId } from '@/lib/themes/content-kind';

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

  const { i18n, content: contentRow } = loaded.record;
  const blocks = asContentBlocks(i18n?.body);

  const kind = await contentKindForTypeId(contentRow.typeId);
  const settings = await getSettings();

  /*
   * Structured data, built from the values this page renders rather than from a
   * second query — a rich result that disagrees with the visible page is worse
   * than none.
   *
   * Emitted on every branch below, the theme-pack one included. A pack renders
   * the body, not the document, so without this a themed site is the one that
   * publishes nothing machine-readable — the opposite of what an operator
   * choosing a designed theme expects.
   */
  const pageSchema = contentPageJsonLd({
    kind: kind === 'post' ? 'article' : 'page',
    path: `/${loaded.locale}/${segment}`,
    title: i18n?.metaTitle || i18n?.title || segment,
    description: i18n?.metaDescription || i18n?.excerpt,
    image: i18n?.ogImage ?? contentRow.featuredImage ?? settings?.logo,
    locale: loaded.locale,
    publishedAt: contentRow.publishedAt,
    updatedAt: contentRow.updatedAt,
    publisher: settings?.siteName ? { name: settings.siteName, logo: settings.logo } : null,
  });

  const trail = breadcrumbJsonLd([
    { name: settings?.siteName || 'Home', path: `/${loaded.locale}` },
    { name: i18n?.title || segment, path: `/${loaded.locale}/${segment}` },
  ]);

  /*
   * FAQPage, from the page's own faq blocks.
   *
   * Emitted HERE rather than from the renderer, and that matters: content-
   * renderer.tsx already does this for the builtin React path, but a theme-pack
   * page never reaches it — so the site with the designed theme was the one
   * publishing no FAQ schema at all. Reading the blocks directly makes it work
   * on both branches, whatever renders the markup.
   *
   * Several faq blocks on one page merge into one node: schema.org expects a
   * single FAQPage per document, and two would leave a validator to guess.
   */
  const faqItems = blocks.flatMap((b) => (b.type === 'faq' ? b.items : []));
  const faq = faqItems.length > 0 ? faqJsonLd(faqItems) : null;

  const schema = (
    <>
      <JsonLd data={pageSchema} />
      <JsonLd data={trail} />
      {faq && <JsonLd data={faq} />}
    </>
  );

  const themed = await tryRenderThemePack({
    kind,
    locale: loaded.locale,
    title: i18n?.title ?? segment,
    excerpt: i18n?.excerpt,
    slug: segment,
    body: i18n?.body,
  });
  if (themed) {
    return (
      <>
        {schema}
        <ThemePackView html={themed.html} cssHrefs={themed.cssHrefs} jsHrefs={themed.jsHrefs} />
      </>
    );
  }

  if (blocksRequestBlankChrome(blocks)) {
    return (
      <div data-test-id="full-page-html">
        {schema}
        <ContentRenderer blocks={blocks} locale={loaded.locale} />
      </div>
    );
  }

  return (
    <article className="mx-auto max-w-4xl px-4 py-16">
      {schema}
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-site-ink">{i18n?.title ?? segment}</h1>
        {i18n?.excerpt && <p className="mt-2 text-lg text-site-ink-muted">{i18n.excerpt}</p>}
      </header>

      <ContentRenderer blocks={blocks} locale={loaded.locale} />
    </article>
  );
}
