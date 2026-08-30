// lib/theme/import.ts
import { COLOR_SLOTS, SLOT_NAMES, themeSchema, type SlotName, type Theme } from './slots';

/**
 * Reading a design system someone else produced.
 *
 * Three shapes, because that is what actually arrives:
 *
 *   1. Our own export — a flat object of slot names.
 *   2. W3C design tokens — what Figma and Style Dictionary emit, nested with
 *      `$value`.
 *   3. A `:root { --site-accent: #… }` paste — the "just give me the CSS"
 *      route, parsed for custom properties only.
 *
 * Never `eval`, never injected as CSS. Even shape 3 is PARSED: we read the
 * custom-property declarations and throw the rest away, so a stylesheet that
 * also contains rules, imports or expressions cannot reach the page.
 */

export interface ImportResult {
  theme: Theme;
  /** Slots that were filled. */
  applied: string[];
  /** Keys present in the file that are not slots — reported, not silently
   *  dropped, so "I uploaded my brand and nothing happened" is answerable. */
  unknown: string[];
  /** Slots that were recognised but whose value was rejected. */
  invalid: { name: string; value: string; reason: string }[];
}

const HEX = /^#[0-9a-f]{6}$/i;
const SHORT_HEX = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i;

/** `#abc` → `#aabbcc`. Common in hand-written files; cheap to accept. */
function normaliseColour(raw: string): string {
  const value = raw.trim().toLowerCase();
  const short = SHORT_HEX.exec(value);
  return short ? `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}` : value;
}

/** Slot names accept a few spellings, since a design file rarely matches ours
 *  exactly: `accentHover`, `accent_hover` and `accent-hover` are one slot. */
const CANONICAL = new Map<string, string>();
for (const name of [...SLOT_NAMES, 'radius']) {
  CANONICAL.set(name, name);
  CANONICAL.set(name.replace(/-/g, ''), name);
  CANONICAL.set(name.replace(/-([a-z])/g, (_, c) => c.toUpperCase()), name);
  CANONICAL.set(name.replace(/-/g, '_'), name);
}
/**
 * Accepts `accent`, `--accent`, `site-accent` and `--site-accent` alike. The
 * CSS parser hands over names with the leading dashes already stripped, so the
 * prefix has to be optional in both parts — matching only `--site-` meant every
 * pasted stylesheet parsed to an empty theme.
 */
const canonical = (key: string) =>
  CANONICAL.get(key.trim().toLowerCase().replace(/^-{0,2}(site-)?/, ''));

/** Flattens W3C design tokens: `{ color: { accent: { $value: '#fff' } } }`. */
function flattenTokens(input: unknown, prefix: string[] = [], out: Record<string, string> = {}) {
  if (!input || typeof input !== 'object') return out;

  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (value && typeof value === 'object') {
      const token = value as Record<string, unknown>;
      const raw = token.$value ?? token.value;
      if (typeof raw === 'string') {
        // The leaf's own name wins: `color.accent.$value` is `accent`, not
        // `color-accent`, because a group name is organisation, not identity.
        out[key] = raw;
        continue;
      }
      flattenTokens(value, [...prefix, key], out);
    } else if (typeof value === 'string') {
      out[key] = value;
    }
  }
  return out;
}

/** Pulls `--name: value;` declarations out of a stylesheet paste. */
function parseCssVariables(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const match of text.matchAll(/--([a-z0-9-]+)\s*:\s*([^;}]+)[;}]/gi)) {
    out[match[1]!] = match[2]!.trim();
  }
  return out;
}

export function parseThemeFile(text: string): ImportResult {
  const trimmed = text.trim();
  let flat: Record<string, string>;

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    let json: unknown;
    try {
      json = JSON.parse(trimmed);
    } catch {
      throw new Error('That file is not valid JSON.');
    }
    flat = flattenTokens(json);
  } else if (trimmed.includes('--')) {
    flat = parseCssVariables(trimmed);
  } else {
    throw new Error('Unrecognised file. Expected JSON design tokens or CSS custom properties.');
  }

  const theme: Record<string, string> = {};
  const applied: string[] = [];
  const unknown: string[] = [];
  const invalid: ImportResult['invalid'] = [];

  for (const [key, rawValue] of Object.entries(flat)) {
    const slot = canonical(key);
    if (!slot) {
      unknown.push(key);
      continue;
    }

    if (slot === 'radius') {
      const value = String(rawValue).trim();
      if (/^(0|\d{1,3}(\.\d+)?(px|rem|em))$/.test(value)) {
        theme.radius = value;
        applied.push('radius');
      } else {
        invalid.push({ name: 'radius', value, reason: 'not a CSS length' });
      }
      continue;
    }

    const value = normaliseColour(String(rawValue));
    if (HEX.test(value)) {
      theme[slot] = value;
      applied.push(slot);
    } else {
      // rgb()/hsl()/named colours are deliberately refused rather than
      // half-converted: a wrong colour is worse than a reported one.
      invalid.push({ name: slot, value, reason: 'not a six-digit hex colour' });
    }
  }

  // Belt and braces: the same validator the API uses, so an importer bug
  // cannot put a value in the database that the form would reject.
  const parsed = themeSchema.safeParse(theme);
  if (!parsed.success) {
    throw new Error('The parsed theme failed validation.');
  }

  return { theme: parsed.data as Theme, applied, unknown, invalid };
}

/**
 * Contrast ratio, so a business cannot save white-on-yellow buttons.
 * WCAG's formula; 4.5 is the AA threshold for body text.
 */
export function contrastRatio(a: string, b: string): number {
  const luminance = (hex: string) => {
    const channels = [0, 2, 4].map((i) => parseInt(hex.replace('#', '').slice(i, i + 2), 16) / 255);
    const [r, g, bl] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * bl!;
  };
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light! + 0.05) / (dark! + 0.05);
}

/** Pairs that must stay readable, whatever a business picks. */
export const CONTRAST_PAIRS: ReadonlyArray<{ fg: string; bg: string; label: string }> = [
  { fg: 'accent-ink', bg: 'accent', label: 'Text on the brand colour' },
  { fg: 'ink', bg: 'surface', label: 'Body text on the page' },
  { fg: 'ink-muted', bg: 'surface', label: 'Secondary text on the page' },
  { fg: 'ink-inverted', bg: 'surface-inverted', label: 'Text on dark sections' },
];

export function checkContrast(theme: Theme): { label: string; ratio: number }[] {
  const value = (name: string) =>
    theme[name as SlotName] ?? COLOR_SLOTS.find((s) => s.name === name)?.fallback;

  const failures: { label: string; ratio: number }[] = [];
  for (const pair of CONTRAST_PAIRS) {
    const fg = value(pair.fg);
    const bg = value(pair.bg);
    if (!fg || !bg) continue;
    const ratio = contrastRatio(fg, bg);
    if (ratio < 4.5) failures.push({ label: pair.label, ratio: Math.round(ratio * 10) / 10 });
  }
  return failures;
}
