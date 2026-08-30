// app/(site)/[locale]/blog/page.tsx
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { listByType } from '@/lib/db/archives';
import { ArchiveList } from '@/components/site/archive-list';
import { locales, type Locale } from '@/lib/env';

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

  return (
    <div className="mx-auto max-w-6xl px-4 py-16">
      <h1 className="mb-8 text-3xl font-bold text-site-ink">{copy.title}</h1>
      <ArchiveList entries={entries} locale={typedLocale} emptyMessage={copy.empty} />
    </div>
  );
}
