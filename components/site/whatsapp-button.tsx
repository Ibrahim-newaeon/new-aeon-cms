// components/site/whatsapp-button.tsx
import { getSettings } from '@/lib/db/queries';
import { getStoreCountry } from '@/lib/commerce/regions';
import { whatsappLink } from '@/lib/commerce/whatsapp';

/**
 * The floating "message us" button.
 *
 * A server-rendered anchor and nothing else: no widget script, no third-party
 * origin, no JavaScript to hydrate. Most chat widgets are a 100 KB bundle that
 * phones home; this is a link, and it does the same job for a shop whose
 * customers are already in WhatsApp.
 *
 * Renders nothing at all when no number is configured — an obviously-dead chat
 * button is worse than none.
 */
const LABEL = {
  ar: 'راسلنا على واتساب',
  en: 'Message us on WhatsApp',
} as const;

export async function WhatsAppButton({ locale }: { locale: 'ar' | 'en' }) {
  const [settings, country] = await Promise.all([getSettings(), getStoreCountry()]);

  const href = whatsappLink({
    phone: settings?.whatsappNumber,
    country,
    message: settings?.whatsappGreeting,
  });
  if (!href) return null;

  const label = LABEL[locale];

  return (
    <a
      href={href}
      target="_blank"
      // noopener because this opens a third-party origin in a new tab.
      rel="noopener noreferrer"
      aria-label={label}
      title={label}
      data-test-id="whatsapp-button"
      /**
       * `end-5`, which is Tailwind's logical `inset-inline-end`: bottom-right
       * in English, bottom-LEFT in Arabic, following the reading direction
       * without a second rule.
       *
       * Written as `inset-inline-end-5` first, which is the CSS property name
       * and not a Tailwind class — so it compiled to nothing, and the button
       * sat on the right in both languages. A class that does not exist fails
       * silently, which is why this was found by measuring rather than reading.
       *
       * z-40 keeps it under the filter sheet (z-50), so it cannot sit on top
       * of an open dialog.
       */
      className="site-whatsapp fixed bottom-5 end-5 z-40 inline-flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-transform hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 motion-reduce:transition-none"
    >
      {/* The official glyph, inline: an <img> from a CDN would undo the point
          of not loading anything third-party. */}
      <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor" aria-hidden="true">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.372-.025-.521-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884a9.82 9.82 0 016.988 2.898 9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0020.465 3.488" />
      </svg>
    </a>
  );
}
