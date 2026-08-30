// lib/theme/presets.ts
import type { Theme } from './slots';

/**
 * Starting points, not a design system each.
 *
 * A business picks the one closest to its brand and changes the accent; that
 * covers most of them without anyone facing seventeen colour pickers on a blank
 * form. Every preset fills EVERY slot, so switching never leaves a site
 * half-themed with the previous choice showing through.
 *
 * Each one is asserted to pass contrast in tests/theme.test.ts. Shipping a
 * preset whose buttons cannot be read would be worse than shipping none: the
 * business would reasonably assume the defaults were safe.
 */

export interface Preset {
  id: string;
  nameEn: string;
  nameAr: string;
  theme: Theme;
}

export const PRESETS: readonly Preset[] = [
  {
    id: 'aeon',
    nameEn: 'Aeon',
    nameAr: 'أيون',
    theme: {
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
  },
  {
    id: 'ink',
    nameEn: 'Ink',
    nameAr: 'حبري',
    theme: {
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
  },
  {
    id: 'sand',
    nameEn: 'Sand',
    nameAr: 'رملي',
    theme: {
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
  },
  {
    id: 'forest',
    nameEn: 'Forest',
    nameAr: 'غابة',
    theme: {
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
  },
  {
    id: 'night',
    nameEn: 'Night',
    nameAr: 'ليلي',
    theme: {
      // A dark storefront, which is the case the role names exist for: nothing
      // here is "the light one" or "the dark one", only surface and ink.
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

export const findPreset = (id: string) => PRESETS.find((p) => p.id === id);
