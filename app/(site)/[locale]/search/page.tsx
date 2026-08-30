// app/(site)/[locale]/search/page.tsx
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Search } from 'lucide-react';
import Image from 'next/image';
import { searchContent, searchProducts } from '@/lib/db/search';
import { commerceEnabled } from '@/lib/commerce/guard';
import { getSettings } from '@/lib/db/queries';
import { formatPrice } from '@/lib/money';
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
    products: 'المنتجات',
    pages: 'الصفحات والمقالات',
  },
  en: {
    title: 'Search',
    placeholder: 'Search the site…',
    submit: 'Search',
    prompt: 'Type at least two characters to search.',
    none: 'No matching results.',
    resultsFor: (n: number, q: string) => `${n} results for “${q}”`,
    products: 'Products',
    pages: 'Pages and articles',
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

  /**
   * Products were absent from this box entirely: a shopper typing a product
   * name got "No matching results" while that product sat on /shop. Content and
   * products are queried together and shown as two groups.
   */
  const commerce = await commerceEnabled();
  const [results, productResults, settings] = await Promise.all([
    query.length >= 2 ? searchContent(query, typedLocale) : Promise.resolve([]),
    query.length >= 2 && commerce ? searchProducts(query, typedLocale) : Promise.resolve([]),
    getSettings(),
  ]);

  const currency = settings?.currency ?? 'JOD';
  const total = results.length + productResults.length;

  return (
    <div className="mx-auto max-w-4xl px-4 py-16">
      <h1 className="text-3xl font-bold text-site-ink">{copy.title}</h1>

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
          className="min-w-0 flex-1 rounded-lg border border-site-line px-4 py-3 text-sm"
          autoComplete="off"
        />
        <button
          type="submit"
          className="inline-flex items-center gap-2 rounded-lg bg-site-accent px-5 py-3 text-sm font-medium text-site-accent-ink hover:bg-site-accent-hover"
        >
          <Search size={16} aria-hidden="true" />
          {copy.submit}
        </button>
      </form>

      <div className="mt-8" aria-live="polite">
        {query.length < 2 ? (
          <p className="text-sm text-site-ink-muted">{copy.prompt}</p>
        ) : total === 0 ? (
          <p className="text-sm text-site-ink-muted">{copy.none}</p>
        ) : (
          <>
            <p className="mb-4 text-sm text-site-ink-muted">{copy.resultsFor(total, query)}</p>

            {productResults.length > 0 && (
              <section className="mb-8">
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-site-ink-muted">
                  {copy.products}
                </h2>
                <ul className="grid gap-3 sm:grid-cols-2">
                  {productResults.map((hit) => (
                    <li key={hit.slug}>
                      <Link
                        href={`/${typedLocale}/products/${hit.slug}`}
                        className="flex gap-3 rounded-lg border border-site-line p-3 transition-colors hover:bg-site-surface-raised"
                      >
                        {hit.imageUrl ? (
                          <Image
                            src={hit.imageUrl}
                            alt=""
                            width={64}
                            height={64}
                            className="h-16 w-16 shrink-0 rounded object-cover"
                          />
                        ) : (
                          <div className="h-16 w-16 shrink-0 rounded bg-site-surface-raised" />
                        )}
                        <span className="min-w-0">
                          <span className="block truncate font-semibold text-site-ink">{hit.name}</span>
                          <span className="mt-1 block text-sm text-site-ink-muted" dir={typedLocale === 'ar' ? undefined : 'ltr'}>
                            {formatPrice(hit.price, currency, typedLocale)}
                          </span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {results.length > 0 && productResults.length > 0 && (
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-site-ink-muted">
                {copy.pages}
              </h2>
            )}

            <ul className="space-y-3">
              {results.map((hit) => (
                <li key={hit.slug}>
                  <Link
                    href={`/${typedLocale}/${hit.slug}`}
                    className="block rounded-lg border border-site-line p-4 transition-colors hover:bg-site-surface-raised"
                  >
                    <h2 className="font-semibold text-site-ink">{hit.title}</h2>
                    {hit.excerpt && (
                      <p className="mt-1 line-clamp-2 text-sm text-site-ink-muted">{hit.excerpt}</p>
                    )}
                    <p className="mt-1 text-xs text-site-ink-muted" dir="ltr">
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
