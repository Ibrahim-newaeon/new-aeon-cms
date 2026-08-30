// app/(site)/[locale]/tag/[slug]/page.tsx
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTagBySlug, listByTag } from '@/lib/db/archives';
import { ArchiveList } from '@/components/site/archive-list';
import { locales, type Locale } from '@/lib/env';

interface Props {
  params: Promise<{ locale: string; slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const typed = locales.includes(locale as Locale) ? (locale as Locale) : undefined;
  const tag = await getTagBySlug(slug, typed);
  return { title: tag?.name ?? slug };
}

export default async function TagArchive({ params }: Props) {
  const { locale, slug } = await params;
  if (!locales.includes(locale as Locale)) notFound();
  const typedLocale = locale as Locale;

  const tag = await getTagBySlug(slug, typedLocale);
  if (!tag) notFound();

  const entries = await listByTag(tag.id, typedLocale);
  const empty = typedLocale === 'ar' ? 'لا يوجد محتوى بهذا الوسم.' : 'Nothing tagged with this yet.';

  return (
    <div className="mx-auto max-w-6xl px-4 py-16">
      <header className="mb-8">
        <p className="text-sm text-site-ink-muted">{typedLocale === 'ar' ? 'وسم' : 'Tag'}</p>
        <h1 className="text-3xl font-bold text-site-ink">{tag.name}</h1>
      </header>
      <ArchiveList entries={entries} locale={typedLocale} emptyMessage={empty} />
    </div>
  );
}
