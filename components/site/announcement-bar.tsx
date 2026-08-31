// components/site/announcement-bar.tsx
import { getSettings } from '@/lib/db/queries';

/**
 * The promo strip above the navbar — delivery terms, gift wrapping, a sale.
 *
 * A server component reading settings directly: it is one row of text with no
 * interaction, so shipping a client bundle for it would be pure cost.
 *
 * Renders NOTHING when the toggle is off or this language has no copy. That
 * second condition matters: a shop that writes the bar in Arabic only should
 * get no bar in English, not an Arabic strip above an English page — the same
 * rule the catalogue now follows for half-translated products.
 *
 * It scrolls away rather than sticking. The navbar below is `sticky top-0`, and
 * pinning both would spend two rows of a phone screen on chrome.
 */
export async function AnnouncementBar({ locale }: { locale: 'ar' | 'en' }) {
  const settings = await getSettings();
  if (!settings?.announcementActive) return null;

  const text = (locale === 'ar' ? settings.announcementAr : settings.announcementEn)?.trim();
  if (!text) return null;

  return (
    <div
      className="bg-site-accent px-4 py-2 text-center text-sm font-medium text-site-accent-ink"
      data-test-id="announcement-bar"
    >
      {text}
    </div>
  );
}
