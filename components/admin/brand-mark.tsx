// components/admin/brand-mark.tsx
/**
 * The supplied logo-dark.png renders "NEW" in #130C0E — near-black, and
 * therefore invisible against the #0c0e13 sidebar. Until a light variant of the
 * asset exists, the wordmark is drawn in CSS so it stays legible: "NEW" in the
 * sidebar's foreground colour, "AEON" in the brand yellow, matching the
 * original mark's structure.
 *
 * Pass `logo` (from settings) to override with a real image once a light
 * version is uploaded.
 */
export function BrandMark({ logo, siteName }: { logo?: string | null; siteName: string }) {
  if (logo) {
    return <img src={logo} alt={siteName} className="h-8 w-auto object-contain" />;
  }

  return (
    <span className="flex items-baseline gap-1.5 leading-none" dir="ltr" aria-label={siteName}>
      <span className="text-lg font-extrabold tracking-[0.08em] text-[var(--admin-text)]">NEW</span>
      <span className="text-2xl font-extrabold tracking-[0.02em] text-[var(--admin-accent)]">
        AEON
      </span>
    </span>
  );
}
