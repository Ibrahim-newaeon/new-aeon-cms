// lib/theme/visitor-mode.ts
import type { ThemeMode } from './slots';

/**
 * The visitor's own light/dark choice.
 *
 * A COOKIE rather than localStorage, because this app renders on the server:
 * the cookie arrives with the request, so the correct `data-theme` is stamped
 * in the HTML that is sent. localStorage would only be readable after
 * hydration, which means either a blocking inline script or a visible flash of
 * the wrong theme on every navigation — the classic dark-mode flicker.
 *
 * The site's own themeMode remains the DEFAULT; this overrides it for one
 * visitor. Absent or unrecognised, nothing is stamped and the site's setting
 * decides, so a tampered cookie degrades to the default rather than erroring.
 */
export const THEME_COOKIE = 'theme';

/** A year: this is a preference, not a session. */
export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export type VisitorMode = 'light' | 'dark';

export function parseVisitorMode(raw: string | undefined | null): VisitorMode | null {
  return raw === 'light' || raw === 'dark' ? raw : null;
}

/**
 * What the visitor actually gets: their own choice if they made one, otherwise
 * whatever the business set.
 */
export function effectiveMode(
  visitor: string | undefined | null,
  siteMode: ThemeMode | null | undefined
): ThemeMode {
  return parseVisitorMode(visitor) ?? siteMode ?? 'light';
}
