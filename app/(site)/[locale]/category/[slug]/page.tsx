// app/(site)/[locale]/category/[slug]/page.tsx
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getCategoryBySlug, listByCategory } from '@/lib/db/archives';
import { ArchiveList } from '@/components/site/archive-list';
import { locales, type Locale } from '@/lib/env';

interface Props {
  params: Promise<{ locale: string; slug: string }>;
}

async function load(localeParam: string, slug: string) {
  if (!locales.includes(localeParam as Locale)) return null;
  const locale = localeParam as Locale;

  const category = await getCategoryBySlug(slug, locale);
  // A deactivated category should not be publicly browsable.
  if (!category || !category.isActive) return null;

  return { category, locale };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const loaded = await load(locale, slug);
  if (!loaded) return {};
  return {
    title: loaded.category.name ?? loaded.category.slug,
    description: loaded.category.description ?? undefined,
  };
}

export default async function CategoryArchive({ params }: Props) {
  const { locale, slug } = await params;
  const loaded = await load(locale, slug);
  if (!loaded) notFound();

  const entries = await listByCategory(loaded.category.id, loaded.locale);
  const empty = loaded.locale === 'ar' ? 'لا يوجد محتوى في هذا التصنيف.' : 'Nothing in this category yet.';

  return (
    <div className="mx-auto max-w-6xl px-4 py-16">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-site-ink">
          {loaded.category.name ?? loaded.category.slug}
        </h1>
        {loaded.category.description && (
          <p className="mt-2 text-site-ink-muted">{loaded.category.description}</p>
        )}
      </header>
      <ArchiveList entries={entries} locale={loaded.locale} emptyMessage={empty} />
    </div>
  );
}
