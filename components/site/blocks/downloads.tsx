import { Download, FileText } from 'lucide-react';
import type { ContentBlock } from '@/lib/blocks/types';

type DownloadsBlockType = Extract<ContentBlock, { type: 'downloads' }>;

const COPY = {
  ar: { heading: 'ملفات للتنزيل', action: 'تنزيل' },
  en: { heading: 'Downloads', action: 'Download' },
} as const;

/**
 * A list of files a reader can take away.
 *
 * Plain links, not buttons with JavaScript: a download is a navigation, and an
 * anchor works with middle-click, "save link as", and a keyboard. The href
 * points at the download route rather than the file, so the browser saves a
 * PDF instead of opening it in its viewer.
 */
export function DownloadsBlock({
  block,
  locale,
}: {
  block: DownloadsBlockType;
  locale: 'ar' | 'en';
}) {
  const copy = COPY[locale];
  const items = block.items.filter((item) => item.url && item.title);
  if (items.length === 0) return null;

  return (
    <section className="rounded-[var(--site-radius)] border border-site-line bg-site-surface-raised p-4">
      <h2 className="mb-3 text-sm font-semibold text-site-ink">{copy.heading}</h2>

      <ul className="divide-y divide-site-line">
        {items.map((item, i) => (
          <li key={i}>
            <a
              href={item.url}
              // Same-origin and served with Content-Disposition: attachment, so
              // `download` is belt and braces rather than the mechanism.
              download
              className="flex items-center gap-3 py-3 text-sm hover:bg-site-surface"
              data-test-id={`download-${i}`}
            >
              <FileText size={18} aria-hidden="true" className="shrink-0 text-site-ink-muted" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-site-ink">{item.title}</span>
                {item.meta && (
                  <span className="block text-xs text-site-ink-muted">{item.meta}</span>
                )}
              </span>
              <span className="flex shrink-0 items-center gap-1 text-site-accent">
                <Download size={16} aria-hidden="true" />
                <span className="sr-only sm:not-sr-only">{copy.action}</span>
              </span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
