// components/site/archive-list.tsx
import Link from 'next/link';
import type { ArchiveEntry } from '@/lib/db/archives';

/** Shared card list for the blog, category and tag archives. */
export function ArchiveList({
  entries,
  locale,
  emptyMessage,
}: {
  entries: ArchiveEntry[];
  locale: 'ar' | 'en';
  emptyMessage: string;
}) {
  if (entries.length === 0) {
    return <p className="py-12 text-center text-sm text-gray-500">{emptyMessage}</p>;
  }

  return (
    <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {entries.map((entry) => (
        <li key={entry.slug}>
          <Link
            href={`/${locale}/${entry.slug}`}
            className="flex h-full flex-col overflow-hidden rounded-lg border border-gray-200 transition-colors hover:bg-gray-50"
          >
            {entry.featuredImage && (
              <img
                src={entry.featuredImage}
                alt=""
                loading="lazy"
                className="aspect-video w-full object-cover"
              />
            )}
            <div className="flex flex-1 flex-col gap-2 p-4">
              <h2 className="font-semibold text-gray-900">{entry.title}</h2>
              {entry.excerpt && (
                <p className="line-clamp-3 flex-1 text-sm text-gray-600">{entry.excerpt}</p>
              )}
              {entry.publishedAt && (
                <time
                  dateTime={entry.publishedAt.toISOString()}
                  className="text-xs text-gray-400"
                  dir="ltr"
                >
                  {entry.publishedAt.toLocaleDateString(locale === 'ar' ? 'ar-SA' : 'en-GB')}
                </time>
              )}
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
