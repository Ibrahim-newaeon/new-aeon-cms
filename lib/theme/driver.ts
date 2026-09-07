// lib/theme/driver.ts
//
// Presentation driver for the public storefront.
//
// - builtin: React shell (default)
// - html-pack: uploaded HTML theme zip for marketing pages (home/page/post/blog)

import { z } from 'zod';

export const THEME_DRIVERS = ['builtin', 'html-pack'] as const;
export type ThemeDriver = (typeof THEME_DRIVERS)[number];

export const themeDriverSchema = z.enum(THEME_DRIVERS);

/** Default for every existing install: the React storefront. */
export const DEFAULT_THEME_DRIVER: ThemeDriver = 'builtin';

/** Both drivers are selectable; html-pack falls back to builtin with no active theme. */
export function isThemeDriverImplemented(driver: ThemeDriver): boolean {
  return driver === 'builtin' || driver === 'html-pack';
}
