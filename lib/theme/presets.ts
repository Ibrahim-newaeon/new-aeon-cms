// lib/theme/presets.ts
import type { Theme } from './slots';

/**
 * Starting points, not a design system each.
 *
 * A business picks the one closest to its brand and changes the accent; that
 * covers most of them without anyone facing seventeen colour pickers on a blank
 * form. Every skin fills EVERY slot in BOTH variants, so switching never leaves
 * a site half-themed with the previous choice showing through.
 *
 * ── Why two themes per skin, not two skins ──────────────────────────────────
 * A skin is the BRAND; light and dark are the same brand under different
 * lighting. Modelling them as separate skins is what produced the old `night`
 * preset: a business that wanted dark had to abandon its colours to get it, and
 * a business that wanted its colours had to give up dark. Splitting the two
 * axes means "Sand, following the visitor's device" is expressible, and it is
 * what a visitor whose phone is set to dark already expects.
 *
 * A dark variant here is written out in full rather than as a diff from its
 * light twin. It costs a few more lines and makes each variant readable on its
 * own — you can tell what a dark storefront looks like without mentally
 * merging two objects. (The CASCADE still merges: an unset dark slot falls
 * through to light. See resolveDark in ./slots.)
 *
 * Every variant is asserted to pass contrast in tests/theme.test.ts. Shipping a
 * skin whose buttons cannot be read would be worse than shipping none: the
 * business would reasonably assume the defaults were safe.
 */

export interface Skin {
  id: string;
  nameEn: string;
  nameAr: string;
  /** The base. Always emitted, and what an unset dark slot falls back to. */
  light: Theme;
  /** Served on a dark device, or forced. */
  dark: Theme;
}

export const SKINS: readonly Skin[] = [
  {
    id: 'aeon',
    nameEn: 'Aeon',
    nameAr: 'أيون',
    light: {
      accent: '#ffc619',
      'accent-hover': '#e0ac0c',
      'accent-ink': '#130c0e',
      surface: '#ffffff',
      'surface-raised': '#f9fafb',
      'surface-inverted': '#0f172a',
      line: '#e5e7eb',
      ink: '#111827',
      'ink-muted': '#5b6472',
      'ink-inverted': '#ffffff',
      success: '#15803d',
      warning: '#b45309',
      danger: '#b91c1c',
      price: '#111827',
      'price-sale': '#c2410c',
      'in-stock': '#15803d',
      'out-of-stock': '#b91c1c',
      radius: '0.75rem',
    },
    dark: {
      // The yellow survives the move to a dark ground unchanged — it is the
      // brand, and a brand that shifts hue at dusk stops being recognisable.
      // What changes is everything it sits on.
      accent: '#ffc619',
      'accent-hover': '#ffd451',
      'accent-ink': '#130c0e',
      surface: '#0f1115',
      'surface-raised': '#171a21',
      'surface-inverted': '#05070a',
      line: '#2a2f3a',
      ink: '#f2f4f8',
      'ink-muted': '#a3adbf',
      'ink-inverted': '#f2f4f8',
      success: '#4ade80',
      warning: '#fbbf24',
      danger: '#fca5a5',
      price: '#f2f4f8',
      'price-sale': '#fdba74',
      'in-stock': '#4ade80',
      'out-of-stock': '#fca5a5',
      radius: '0.75rem',
    },
  },
  {
    id: 'ink',
    nameEn: 'Ink',
    nameAr: 'حبري',
    light: {
      accent: '#111827',
      'accent-hover': '#000000',
      'accent-ink': '#ffffff',
      surface: '#ffffff',
      'surface-raised': '#f4f4f5',
      'surface-inverted': '#111827',
      line: '#d4d4d8',
      ink: '#18181b',
      'ink-muted': '#52525b',
      'ink-inverted': '#fafafa',
      success: '#15803d',
      warning: '#a16207',
      danger: '#b91c1c',
      price: '#18181b',
      'price-sale': '#b91c1c',
      'in-stock': '#15803d',
      'out-of-stock': '#b91c1c',
      radius: '0',
    },
    dark: {
      // A monochrome brand inverts rather than recolours: the accent is the
      // ink and the ink is the accent.
      accent: '#f4f4f5',
      'accent-hover': '#ffffff',
      'accent-ink': '#18181b',
      surface: '#09090b',
      'surface-raised': '#18181b',
      'surface-inverted': '#000000',
      line: '#2e2e33',
      ink: '#fafafa',
      'ink-muted': '#a1a1aa',
      'ink-inverted': '#fafafa',
      success: '#4ade80',
      warning: '#fcd34d',
      danger: '#fca5a5',
      price: '#fafafa',
      'price-sale': '#fca5a5',
      'in-stock': '#4ade80',
      'out-of-stock': '#fca5a5',
      radius: '0',
    },
  },
  {
    id: 'sand',
    nameEn: 'Sand',
    nameAr: 'رملي',
    light: {
      accent: '#9a5b2c',
      'accent-hover': '#7d4922',
      'accent-ink': '#ffffff',
      surface: '#fbf7f2',
      'surface-raised': '#f2e9df',
      'surface-inverted': '#3b2a1c',
      line: '#ded2c4',
      ink: '#2b211a',
      'ink-muted': '#6b5a4b',
      'ink-inverted': '#faf5ef',
      success: '#3f6212',
      warning: '#a16207',
      danger: '#a1341f',
      price: '#2b211a',
      'price-sale': '#a1341f',
      'in-stock': '#3f6212',
      'out-of-stock': '#a1341f',
      radius: '0.5rem',
    },
    dark: {
      // The brown lightens to a tan. A mid-brown accent that reads as rich on
      // cream turns into a muddy smear on near-black, so this is the one skin
      // whose accent genuinely has to move.
      accent: '#d99a5b',
      'accent-hover': '#e8b078',
      'accent-ink': '#2b1c10',
      surface: '#17110c',
      'surface-raised': '#221a12',
      'surface-inverted': '#0d0906',
      line: '#3a2d21',
      ink: '#f5ebe0',
      'ink-muted': '#bfa88f',
      'ink-inverted': '#f5ebe0',
      success: '#a3c76d',
      warning: '#e8b25e',
      danger: '#ef9a8a',
      price: '#f5ebe0',
      'price-sale': '#ef9a8a',
      'in-stock': '#a3c76d',
      'out-of-stock': '#ef9a8a',
      radius: '0.5rem',
    },
  },
  {
    id: 'forest',
    nameEn: 'Forest',
    nameAr: 'غابة',
    light: {
      accent: '#0f7b5a',
      'accent-hover': '#0c6349',
      'accent-ink': '#ffffff',
      surface: '#ffffff',
      'surface-raised': '#f1f7f4',
      'surface-inverted': '#14342b',
      line: '#d7e5df',
      ink: '#12211c',
      'ink-muted': '#4f635b',
      'ink-inverted': '#f4faf7',
      success: '#0f7b5a',
      warning: '#a16207',
      danger: '#b3261e',
      price: '#12211c',
      'price-sale': '#b3261e',
      'in-stock': '#0f7b5a',
      'out-of-stock': '#b3261e',
      radius: '1rem',
    },
    dark: {
      accent: '#34d399',
      'accent-hover': '#6ee7b7',
      'accent-ink': '#04241a',
      surface: '#0a1512',
      'surface-raised': '#12211c',
      'surface-inverted': '#050d0a',
      line: '#22362e',
      ink: '#e6f4ee',
      'ink-muted': '#93b3a6',
      'ink-inverted': '#e6f4ee',
      success: '#34d399',
      warning: '#fbbf24',
      danger: '#fca5a5',
      price: '#e6f4ee',
      'price-sale': '#fca5a5',
      'in-stock': '#34d399',
      'out-of-stock': '#fca5a5',
      radius: '1rem',
    },
  },
  {
    id: 'night',
    nameEn: 'Night',
    nameAr: 'ليلي',
    light: {
      // Night used to be dark-ONLY, which meant a business that liked it had
      // no light variant to offer a visitor on a light device. This is the
      // light half it never had: same cool blue, on paper instead of glass.
      accent: '#0369a1',
      'accent-hover': '#075985',
      'accent-ink': '#ffffff',
      surface: '#ffffff',
      'surface-raised': '#f1f5f9',
      'surface-inverted': '#0b1220',
      line: '#dbe3ee',
      ink: '#0f172a',
      'ink-muted': '#51607a',
      'ink-inverted': '#e8eefc',
      success: '#15803d',
      warning: '#b45309',
      danger: '#b91c1c',
      price: '#0f172a',
      'price-sale': '#c2410c',
      'in-stock': '#15803d',
      'out-of-stock': '#b91c1c',
      radius: '0.75rem',
    },
    dark: {
      // The original Night, unchanged: nothing here is "the light one" or "the
      // dark one", only surface and ink, which is the case the role names exist
      // for.
      accent: '#7dd3fc',
      'accent-hover': '#a5e4ff',
      'accent-ink': '#04202e',
      surface: '#0b1220',
      'surface-raised': '#141d2e',
      'surface-inverted': '#05080f',
      line: '#27324a',
      ink: '#e8eefc',
      'ink-muted': '#9aa8c4',
      'ink-inverted': '#e8eefc',
      success: '#4ade80',
      warning: '#fbbf24',
      danger: '#fca5a5',
      price: '#e8eefc',
      'price-sale': '#fca5a5',
      'in-stock': '#4ade80',
      'out-of-stock': '#fca5a5',
      radius: '0.75rem',
    },
  },
] as const;

export const findSkin = (id: string) => SKINS.find((s) => s.id === id);
