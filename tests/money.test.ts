import { describe, it, expect } from 'vitest';
import { formatPrice, toMajorUnits, toMinorUnits, minorUnitExponent } from '@/lib/money';

/**
 * These exist because of a real, expensive bug: the original helper hardcoded
 * `/1000` and three decimals, which is right for JOD and wrong for every
 * 2-decimal currency. A store switched to USD rendered 12900 cents as "$12.900"
 * — a tenth of the real price, i.e. selling at 90% off.
 */
describe('minor units', () => {
  it('uses 3 decimals for JOD and the other 1000-subunit currencies', () => {
    for (const c of ['JOD', 'KWD', 'BHD', 'OMR', 'TND', 'IQD', 'LYD']) {
      expect(minorUnitExponent(c)).toBe(3);
    }
  });

  it('uses 0 decimals for currencies with no subunit', () => {
    for (const c of ['JPY', 'KRW', 'VND', 'CLP', 'ISK']) {
      expect(minorUnitExponent(c)).toBe(0);
    }
  });

  it('defaults to 2 decimals for everything else', () => {
    for (const c of ['USD', 'EUR', 'SAR', 'AED', 'EGP', 'GBP', 'ZZZ']) {
      expect(minorUnitExponent(c)).toBe(2);
    }
  });

  it('is case-insensitive', () => {
    expect(minorUnitExponent('jod')).toBe(3);
    expect(minorUnitExponent('usd')).toBe(2);
  });

  it('converts between major and minor units', () => {
    expect(toMajorUnits(129000, 'JOD')).toBe(129);
    expect(toMajorUnits(12900, 'USD')).toBe(129);
    expect(toMinorUnits(129, 'JOD')).toBe(129000);
    expect(toMinorUnits(129, 'USD')).toBe(12900);
  });

  it('rounds rather than truncates when storing what an editor typed', () => {
    // 19.995 USD is 1999.5 cents; truncation would quietly under-charge.
    expect(toMinorUnits(19.995, 'USD')).toBe(2000);
    expect(toMinorUnits(0.005, 'USD')).toBe(1);
  });

  it('round-trips without drifting', () => {
    for (const [amount, currency] of [[129000, 'JOD'], [12900, 'USD'], [500, 'JPY']] as const) {
      expect(toMinorUnits(toMajorUnits(amount, currency), currency)).toBe(amount);
    }
  });
});

describe('formatPrice', () => {
  it('renders JOD with three decimals, not the two Intl would default to', () => {
    // The regression that motivated all of this: 129000 fils is 129 dinars.
    expect(formatPrice(129000, 'JOD', 'en')).toContain('129.000');
  });

  it('renders USD with two decimals', () => {
    const out = formatPrice(12900, 'USD', 'en');
    expect(out).toContain('129.00');
    expect(out).not.toContain('12.900');
  });

  it('renders JPY with none', () => {
    expect(formatPrice(500, 'JPY', 'en')).toContain('500');
    expect(formatPrice(500, 'JPY', 'en')).not.toContain('500.00');
  });

  it('uses Latin digits for English and Arabic-Indic for Arabic', () => {
    // An English page previously rendered prices with Arabic-Indic digits.
    expect(formatPrice(129000, 'JOD', 'en')).toMatch(/[0-9]/);
    expect(formatPrice(129000, 'JOD', 'ar')).toMatch(/[٠-٩]/);
  });

  it('falls back to a readable string rather than throwing on a bad ISO code', () => {
    // Currency is editable in Settings, so an invalid code must not crash a
    // product page.
    const out = formatPrice(12900, 'NOTACURRENCY', 'en');
    expect(out).toContain('129.00');
    expect(out).toContain('NOTACURRENCY');
  });

  it('handles zero and defaults to JOD', () => {
    expect(formatPrice(0, 'JOD', 'en')).toContain('0.000');
    expect(formatPrice(129000)).toBeTruthy();
  });
});
