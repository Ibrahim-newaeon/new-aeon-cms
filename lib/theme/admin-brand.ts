// lib/theme/admin-brand.ts
import { hexToChannels } from './slots';
import { contrastRatio } from './import';

/**
 * The admin panel wearing the client's brand instead of ours.
 *
 * The storefront was themeable from the start; the admin was not, because it
 * only ever had one tenant. The moment this CMS is sold twice, a client logs in
 * and reads someone else's name in the sidebar — so the identity has to come
 * from settings like everything else.
 *
 * Deliberately ONE colour, not a second seventeen-slot palette. The admin's
 * greys are structure rather than brand, and asking a client to re-pick them
 * would be a worse product for no gain. What they choose is the accent; the
 * three values derived from it below are the ones that have to stay consistent
 * with it.
 */

export const ADMIN_ACCENT_FALLBACK = '#ffc619';

/** `#1a2b3c` → `#4a5b6c`-ish: mixes toward white for the hover state. */
function lighten(hex: string, amount = 0.18): string {
  const channels = hexToChannels(hex)
    .split(' ')
    .map((n) => Math.round(Number(n) + (255 - Number(n)) * amount));
  return `#${channels.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * Black or white on the accent, whichever is legible.
 *
 * The admin button hardcoded #130c0e — "the logo's ink, for text on the yellow
 * accent" — which is correct for yellow and unreadable the moment a client
 * picks navy. Derived rather than asked for: a business should not have to
 * understand contrast ratios to get a readable button, and this is the one
 * choice that has a right answer.
 */
export function accentInk(accent: string): string {
  return contrastRatio(accent, '#130c0e') >= contrastRatio(accent, '#ffffff')
    ? '#130c0e'
    : '#ffffff';
}

/**
 * The `:root` override for a client's admin accent.
 *
 * Emits the aliases (--admin-primary*) too: components still reference them,
 * and a half-applied accent — new buttons branded, older ones still yellow — is
 * worse than none.
 */
export function adminBrandCss(accent: string | null | undefined): string {
  if (!accent || !/^#[0-9a-f]{6}$/i.test(accent)) return '';
  if (accent.toLowerCase() === ADMIN_ACCENT_FALLBACK) return '';

  const soft = lighten(accent);
  const channels = hexToChannels(accent);

  return `:root{--admin-accent:${accent};--admin-accent-soft:${soft};--admin-accent-muted:rgb(${channels} / 0.15);--admin-accent-ink:${accentInk(accent)};--admin-primary:${accent};--admin-primary-hover:${soft};--admin-primary-muted:rgb(${channels} / 0.15);}`;
}

/**
 * The wordmark, split the way the original mark is: the first word in the
 * sidebar's foreground colour, the rest in the accent.
 *
 * Generalised from the hardcoded "NEW / AEON" rather than replaced, so the
 * shape a client sees is the one this panel was designed around — it just says
 * their name. A single-word name goes entirely in the accent, which is the
 * degenerate case of the same rule and still reads as a mark.
 */
export function wordmark(siteName: string): { lead: string; tail: string } {
  // Capped because this sits in a fixed-width sidebar; a long name is better
  // truncated than wrapped into the navigation below it.
  const words = siteName.trim().slice(0, 28).split(/\s+/).filter(Boolean);
  if (words.length === 0) return { lead: '', tail: 'CMS' };
  if (words.length === 1) return { lead: '', tail: words[0]! };
  return { lead: words[0]!, tail: words.slice(1).join(' ') };
}
