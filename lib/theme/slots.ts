// lib/theme/slots.ts
import { z } from 'zod';

/**
 * The storefront's design contract.
 *
 * ONE list. The CSS defaults, the Settings form, the validator, the design-file
 * import/export and the emitted stylesheet are all generated from it, so a slot
 * cannot exist in one place and be missing from another — which is the failure
 * this codebase keeps producing when a list gets written twice.
 *
 * Slots are named by ROLE. "surface" survives a switch to a dark brand;
 * "light-grey" does not.
 */

export interface SlotDef {
  /** Matches the CSS custom property: `accent` → `--site-accent`. */
  name: string;
  /** Shown in Settings. */
  labelEn: string;
  labelAr: string;
  /** Falls back to this when a business leaves it blank. */
  fallback: string;
  /** `shop` slots are hidden when commerce is off; they still have defaults. */
  group: 'brand' | 'surface' | 'text' | 'status' | 'shop';
}

export const COLOR_SLOTS = [
  { name: 'accent', labelEn: 'Brand colour', labelAr: 'لون العلامة', fallback: '#ffc619', group: 'brand' },
  { name: 'accent-hover', labelEn: 'Brand colour (hover)', labelAr: 'لون العلامة عند المرور', fallback: '#fddc0d', group: 'brand' },
  { name: 'accent-ink', labelEn: 'Text on brand colour', labelAr: 'النص فوق لون العلامة', fallback: '#130c0e', group: 'brand' },

  { name: 'surface', labelEn: 'Page background', labelAr: 'خلفية الصفحة', fallback: '#ffffff', group: 'surface' },
  { name: 'surface-raised', labelEn: 'Card background', labelAr: 'خلفية البطاقات', fallback: '#f9fafb', group: 'surface' },
  { name: 'surface-inverted', labelEn: 'Dark sections', labelAr: 'الأقسام الداكنة', fallback: '#0f172a', group: 'surface' },
  { name: 'line', labelEn: 'Borders', labelAr: 'الحدود', fallback: '#e5e7eb', group: 'surface' },

  { name: 'ink', labelEn: 'Body text', labelAr: 'نص المحتوى', fallback: '#111827', group: 'text' },
  { name: 'ink-muted', labelEn: 'Secondary text', labelAr: 'النص الثانوي', fallback: '#6b7280', group: 'text' },
  { name: 'ink-inverted', labelEn: 'Text on dark sections', labelAr: 'النص فوق الداكن', fallback: '#ffffff', group: 'text' },

  { name: 'success', labelEn: 'Success', labelAr: 'نجاح', fallback: '#15803d', group: 'status' },
  { name: 'warning', labelEn: 'Warning', labelAr: 'تحذير', fallback: '#b45309', group: 'status' },
  { name: 'danger', labelEn: 'Error', labelAr: 'خطأ', fallback: '#b91c1c', group: 'status' },

  { name: 'price', labelEn: 'Price', labelAr: 'السعر', fallback: '#111827', group: 'shop' },
  { name: 'price-sale', labelEn: 'Sale price', labelAr: 'سعر التخفيض', fallback: '#dc2626', group: 'shop' },
  { name: 'in-stock', labelEn: 'In stock', labelAr: 'متوفر', fallback: '#15803d', group: 'shop' },
  { name: 'out-of-stock', labelEn: 'Out of stock', labelAr: 'غير متوفر', fallback: '#b91c1c', group: 'shop' },
] as const satisfies readonly SlotDef[];

/** The literal slot names, so a typo in a lookup is a compile error. */
export type SlotName = (typeof COLOR_SLOTS)[number]['name'];

export const SLOT_NAMES = COLOR_SLOTS.map((s) => s.name);

/** Six-digit hex only. Short hex and named colours are rejected so the
 *  channel conversion below never has to guess. */
const hexColor = z
  .string()
  .trim()
  .regex(/^#[0-9a-f]{6}$/i, 'Use a six-digit hex colour, e.g. #1a2b3c');

/** A CSS length, not arbitrary CSS: `12px`, `0.75rem`, `0`. */
const radius = z
  .string()
  .trim()
  .regex(/^(0|\d{1,3}(\.\d+)?(px|rem|em))$/, 'Use a length such as 8px or 0.5rem');

/**
 * A saved theme.
 *
 * `.strict()` matters: an unknown key is an error, not something quietly
 * dropped. If a design file names a slot we do not have, the importer should
 * say so rather than pretend it applied.
 */
export const themeSchema = z
  .object(
    Object.fromEntries([
      ...COLOR_SLOTS.map((slot) => [slot.name, hexColor.optional()]),
      ['radius', radius.optional()],
    ]) as Record<string, z.ZodOptional<z.ZodString>>
  )
  .strict();

/**
 * Declared rather than inferred. The shape above is built from the slot list at
 * runtime, so z.infer widens the keys to `string` and every lookup becomes
 * unchecked — the opposite of the point.
 */
export type Theme = Partial<Record<SlotName | 'radius', string>>;

export const RADIUS_FALLBACK = '0.75rem';

/** `#1a2b3c` → `26 43 60`, the form the Tailwind utilities compile against. */
export function hexToChannels(hex: string): string {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).join(' ');
}

/**
 * The `:root` block for a saved theme.
 *
 * Emits BOTH forms of every colour: the hex slot, which is the human contract
 * and what a design file speaks, and the channel twin, which is what
 * `text-site-ink/70` needs — Tailwind's opacity modifier cannot inject an alpha
 * into a `var()` and silently produces black when asked to.
 *
 * Only known slots and validated values reach this function, so nothing here
 * can carry arbitrary CSS into the page.
 */
export function themeToCss(
  theme: Theme | null | undefined,
  /**
   * `:root:root` is used by the admin preview. Same element, double the
   * specificity, so a draft wins over the site's own saved-theme rule without
   * depending on which appears later in the document.
   */
  selector: ':root' | ':root:root' = ':root'
): string {
  if (!theme) return '';

  const lines: string[] = [];
  for (const slot of COLOR_SLOTS) {
    const value = theme[slot.name];
    if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value)) continue;
    lines.push(`--site-${slot.name}:${value};`);
    lines.push(`--site-${slot.name}-rgb:${hexToChannels(value)};`);
  }
  if (typeof theme.radius === 'string' && theme.radius) {
    lines.push(`--site-radius:${theme.radius};`);
  }

  return lines.length ? `${selector}{${lines.join('')}}` : '';
}

/**
 * The current theme as a file an author can edit and re-upload.
 *
 * Every slot is present, filled with its default where unset: the export is
 * also the TEMPLATE, so handing it to a designer must not require them to know
 * which names exist.
 */
export function themeToFile(theme: Theme | null | undefined): Record<string, string> {
  const file: Record<string, string> = {};
  for (const slot of COLOR_SLOTS) {
    file[slot.name] = theme?.[slot.name] ?? slot.fallback;
  }
  file.radius = theme?.radius ?? RADIUS_FALLBACK;
  return file;
}

/* ── Light and dark ─────────────────────────────────────────────────────── */

/**
 * What decides which of a skin's two themes a visitor gets.
 *
 * `auto` is not "dark". It hands the choice to the device, which is what a
 * visitor who has set their phone to dark already expects everywhere else.
 * `light` and `dark` force one, for a business whose brand only works one way.
 */
export const THEME_MODES = ['light', 'dark', 'auto'] as const;
export type ThemeMode = (typeof THEME_MODES)[number];
export const themeModeSchema = z.enum(THEME_MODES);
export const THEME_MODE_FALLBACK: ThemeMode = 'light';

/**
 * The dark theme as the browser actually resolves it.
 *
 * A dark theme carries only what DIFFERS from the light one; every slot it
 * leaves unset cascades through to the `:root` block, because that is what the
 * CSS below emits. So the effective dark theme is the light one with the dark
 * one laid over it — and anything reasoning about the dark result (contrast
 * checks, swatches, the preview) has to reason about this merge, not about the
 * dark object on its own. Checking the raw dark object would compare a dark
 * background against a body colour it never actually renders with.
 */
export function resolveDark(light: Theme | null | undefined, dark: Theme | null | undefined): Theme {
  return { ...(light ?? {}), ...(dark ?? {}) };
}

/** True when a dark variant has anything worth emitting. */
export function hasDark(dark: Theme | null | undefined): boolean {
  return Boolean(dark && Object.values(dark).some((v) => typeof v === 'string' && v));
}

/**
 * The full stylesheet for a skin: light, plus dark in both the ways a dark
 * theme can be asked for.
 *
 * The emitted CSS is the SAME whatever the mode — the mode only decides what
 * gets stamped on <html> (see themeModeAttr). That is deliberate: it keeps one
 * cascade to reason about, and it means switching mode is an attribute change
 * rather than a different stylesheet.
 *
 * Three states, because the viewer has three:
 *   - `:root`                                  — light, always the base
 *   - `@media (prefers-color-scheme: dark)`    — the device asked for dark, and
 *     guarded with `:not([data-theme="light"])` so a business that forced light
 *     still gets light on a dark phone
 *   - `:root[data-theme="dark"]`               — dark was forced, and wins on a
 *     light device too
 *
 * Without the third block, forcing dark would do nothing for the majority of
 * visitors, whose devices are set to light. Without the guard on the second,
 * forcing light would be ignored by anyone whose phone is dark. Both are the
 * classic half-implemented dark mode.
 */
export function themePairToCss(
  light: Theme | null | undefined,
  dark: Theme | null | undefined
): string {
  const base = themeToCss(light);

  if (!hasDark(dark)) return base;

  // Emitted whole rather than as a diff: a partial block would leave the light
  // value showing for any slot the dark theme happens to share, which is
  // correct, but it makes the emitted CSS depend on the light theme's contents
  // and impossible to read on its own.
  const darkVars = themeToCss(resolveDark(light, dark), ':root');
  if (!darkVars) return base;

  const body = darkVars.slice(darkVars.indexOf('{'));

  return [
    base,
    `@media (prefers-color-scheme:dark){:root:not([data-theme="light"])${body}}`,
    `:root[data-theme="dark"]${body}`,
  ].join('');
}

/**
 * What to stamp on <html>.
 *
 * `auto` stamps NOTHING — the absence of the attribute is what lets the media
 * query decide. Stamping `data-theme="auto"` would match neither selector and
 * silently pin every visitor to light.
 */
export function themeModeAttr(mode: ThemeMode | null | undefined): 'light' | 'dark' | undefined {
  return mode === 'dark' ? 'dark' : mode === 'light' ? 'light' : undefined;
}
