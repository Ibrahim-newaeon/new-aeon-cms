// app/(site)/[locale]/[slug]/page.tsx
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getContentBySlug } from '@/lib/db/queries';
import { ContentRenderer } from '@/components/site/content-renderer';
import { asContentBlocks } from '@/lib/blocks/content-schema';
import { locales, type Locale } from '@/lib/env';

interface Params {
  params: Promise<{ locale: string; slug: string }>;
}

async function load(localeParam: string, slug: string) {
  if (!locales.includes(localeParam as Locale)) return null;
  const locale = localeParam as Locale;

  const record = await getContentBySlug(slug, locale);

  // Drafts and archived content must not be reachable by URL guessing.
  if (!record || record.content.status !== 'published') return null;

  return { record, locale };
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale, slug } = await params;
  const loaded = await load(locale, slug);
  if (!loaded) return {};

  const { i18n } = loaded.record;
  return {
    title: i18n?.metaTitle || i18n?.title || slug,
    description: i18n?.metaDescription || i18n?.excerpt || undefined,
    robots: i18n?.noIndex ? { index: false, follow: false } : undefined,
    openGraph: i18n?.ogImage ? { images: [i18n.ogImage] } : undefined,
  };
}

export default async function ContentPage({ params }: Params) {
  const { locale, slug } = await params;
  const loaded = await load(locale, slug);

  if (!loaded) notFound();

  const { i18n } = loaded.record;

  return (
    <article className="mx-auto max-w-4xl px-4 py-16">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-site-ink">{i18n?.title ?? slug}</h1>
        {i18n?.excerpt && <p className="mt-2 text-lg text-site-ink-muted">{i18n.excerpt}</p>}
      </header>

      <ContentRenderer blocks={asContentBlocks(i18n?.body)} locale={loaded.locale} />
    </article>
  );
}
