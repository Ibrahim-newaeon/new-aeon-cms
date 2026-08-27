import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Re-exported from lib/money. The old implementation lived here and hardcoded
 * /1000 with three decimals, which was wrong for every currency except JOD.
 */
export { formatPrice, toMajorUnits, toMinorUnits, minorUnitExponent } from './money';

export function generateSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .substring(0, 255);
}

export function normalizeArabic(input: string): string {
  if (!input) return '';
  return input
    .toLowerCase()
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[٠-٩]/g, d => String.fromCharCode(d.charCodeAt(0) - 1584))
    .replace(/\s+/g, ' ')
    .trim();
}
