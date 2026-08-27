// app/(site)/[locale]/search/page.tsx
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Search } from 'lucide-react';
import { searchContent } from '@/lib/db/search';
import { locales, type Locale } from '@/lib/env';

interface Props {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string }>;
}

const COPY = {
  ar: {
    title: 'البحث',
    placeholder: 'ابحث في الموقع…',
    submit: 'بحث',
    prompt: 'اكتب كلمتين على الأقل للبحث.',
    none: 'لا توجد نتائج مطابقة.',
    resultsFor: (n: number, q: string) => `${n} نتيجة عن «${q}»`,
  },
  en: {
    title: 'Search',
    placeholder: 'Search the site…',
    submit: 'Search',
    prompt: 'Type at least two characters to search.',
    none: 'No matching results.',
    resultsFor: (n: number, q: string) => `${n} results for “${q}”`,
  },
} as const;

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { locale } = await params;
  const { q } = await searchParams;
  const copy = COPY[locale === 'en' ? 'en' : 'ar'];
  return {
    title: q ? `${copy.title}: ${q}` : copy.title,
    // A results page has no standalone value to a search engine, and indexing
    // arbitrary ?q= URLs invites duplicate-content and spam-injection issues.
    robots: { index: false, follow: true },
  };
}

export default async function SearchPage({ params, searchParams }: Props) {
  const { locale } = await params;
  if (!locales.includes(locale as Locale)) notFound();
  const typedLocale = locale as Locale;

  const { q } = await searchParams;
  const query = (q ?? '').trim();
  const copy = COPY[typedLocale];

  const results = query.length >= 2 ? await searchContent(query, typedLocale) : [];

  return (
    <div className="mx-auto max-w-4xl px-4 py-16">
      <h1 className="text-3xl font-bold text-gray-900">{copy.title}</h1>

      {/* GET so a search is linkable and back/forward work. */}
      <form method="get" className="mt-6 flex gap-2" role="search">
        <label htmlFor="q" className="sr-only">
          {copy.placeholder}
        </label>
        <input
          id="q"
          name="q"
          type="search"
          defaultValue={query}
          placeholder={copy.placeholder}
          className="min-w-0 flex-1 rounded-lg border border-gray-300 px-4 py-3 text-sm"
          autoComplete="off"
        />
        <button
          type="submit"
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-3 text-sm font-medium text-white hover:bg-indigo-700"
        >
          <Search size={16} aria-hidden="true" />
          {copy.submit}
        </button>
      </form>

      <div className="mt-8" aria-live="polite">
        {query.length < 2 ? (
          <p className="text-sm text-gray-500">{copy.prompt}</p>
        ) : results.length === 0 ? (
          <p className="text-sm text-gray-500">{copy.none}</p>
        ) : (
          <>
            <p className="mb-4 text-sm text-gray-500">{copy.resultsFor(results.length, query)}</p>
            <ul className="space-y-3">
              {results.map((hit) => (
                <li key={hit.slug}>
                  <Link
                    href={`/${typedLocale}/${hit.slug}`}
                    className="block rounded-lg border border-gray-200 p-4 transition-colors hover:bg-gray-50"
                  >
                    <h2 className="font-semibold text-gray-900">{hit.title}</h2>
                    {hit.excerpt && (
                      <p className="mt-1 line-clamp-2 text-sm text-gray-600">{hit.excerpt}</p>
                    )}
                    <p className="mt-1 text-xs text-gray-400" dir="ltr">
                      /{typedLocale}/{hit.slug}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
