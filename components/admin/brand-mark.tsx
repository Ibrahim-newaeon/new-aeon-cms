// components/admin/brand-mark.tsx
import { wordmark } from '@/lib/theme/admin-brand';

/**
 * The mark in the admin sidebar.
 *
 * An uploaded image wins. Otherwise the name is DRAWN, because the storefront
 * logo cannot be reused here: the supplied logo-dark.png renders its first word
 * in #130C0E — near-black, and therefore invisible against the #0c0e13 sidebar.
 * That is why `adminLogo` is a separate setting rather than a fallback to
 * `logo`; handing a client's light-page logo to a dark sidebar produces a blank
 * corner and no error.
 *
 * The drawn form used to be the literal "NEW / AEON". It now splits whatever
 * the site is called, so a client's panel says their name — the same mark,
 * with the identity no longer hardcoded.
 */
export function BrandMark({ logo, siteName }: { logo?: string | null; siteName: string }) {
  if (logo) {
    // A plain <img>: a client-uploaded mark of unknown dimensions, where
    // next/image would need width/height we do not have. One small asset.
    return <img src={logo} alt={siteName} className="h-8 w-auto object-contain" />;
  }

  const { lead, tail } = wordmark(siteName);

  return (
    <span className="flex items-baseline gap-1.5 leading-none" dir="ltr" aria-label={siteName}>
      {lead && (
        <span className="text-lg font-extrabold tracking-[0.08em] text-[var(--admin-text)]">
          {lead.toUpperCase()}
        </span>
      )}
      <span className="text-2xl font-extrabold tracking-[0.02em] text-[var(--admin-accent)]">
        {tail.toUpperCase()}
      </span>
    </span>
  );
}
