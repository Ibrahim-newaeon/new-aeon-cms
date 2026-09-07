// app/(site)/[locale]/blog/page.tsx
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { listByType } from '@/lib/db/archives';
import { ArchiveList } from '@/components/site/archive-list';
import { locales, type Locale } from '@/lib/env';
import { tryRenderThemePack } from '@/lib/themes/present';
import { ThemePackView } from '@/components/site/theme-pack-view';

const COPY = {
  ar: { title: 'المدونة', empty: 'لا توجد مقالات منشورة بعد.' },
  en: { title: 'Blog', empty: 'No published posts yet.' },
} as const;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return { title: COPY[locale === 'en' ? 'en' : 'ar'].title };
}

export default async function BlogPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!locales.includes(locale as Locale)) notFound();
  const typedLocale = locale as Locale;

  const entries = await listByType('post', typedLocale);
  const copy = COPY[typedLocale];

  const themed = await tryRenderThemePack({
    kind: 'blog',
    locale: typedLocale,
    title: copy.title,
    body: [],
    posts: entries.map((e) => ({
      title: e.title,
      excerpt: e.excerpt,
      url: `/${typedLocale}/${e.slug}`,
    })),
  });
  if (themed) {
    return <ThemePackView html={themed.html} cssHrefs={themed.cssHrefs} jsHrefs={themed.jsHrefs} />;
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-16">
      <h1 className="mb-8 text-3xl font-bold text-site-ink">{copy.title}</h1>
      <ArchiveList entries={entries} locale={typedLocale} emptyMessage={copy.empty} />
    </div>
  );
}
