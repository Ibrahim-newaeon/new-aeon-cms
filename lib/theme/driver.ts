// lib/theme/driver.ts
//
// Presentation driver for the public storefront.
//
// v1 ships only `builtin` (the React shell). `html-pack` is reserved for the
// HTML theme-zip runtime — keeping the setting in the schema now means the
// investment lands as a driver switch, not a second product fork.

import { z } from 'zod';

export const THEME_DRIVERS = ['builtin', 'html-pack'] as const;
export type ThemeDriver = (typeof THEME_DRIVERS)[number];

export const themeDriverSchema = z.enum(THEME_DRIVERS);

/** Default for every existing install: the React storefront. */
export const DEFAULT_THEME_DRIVER: ThemeDriver = 'builtin';

/**
 * HTML theme packs are not implemented yet. Selecting them must fail closed
 * at the API boundary until the zip runtime ships.
 */
export function isThemeDriverImplemented(driver: ThemeDriver): boolean {
  return driver === 'builtin';
}
