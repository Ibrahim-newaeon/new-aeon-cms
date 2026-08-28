import { describe, it, expect } from 'vitest';
import {
  normalisePhone,
  isValidJordanianMobile,
  isGovernorate,
  GOVERNORATES,
} from '@/lib/commerce/phone';

/**
 * Normalisation is what makes `customers.phone` a usable identity. The upsert
 * in placeOrder keys on it, so a spelling that normalises differently silently
 * creates a second customer and breaks order history for that person.
 */
describe('normalisePhone', () => {
  const CANONICAL = '0791234567';

  it('maps every common spelling of one number to the same canonical form', () => {
    for (const input of [
      '0791234567',
      '079 123 4567',
      '079-123-4567',
      '+962791234567',
      '+962 79 123 4567',
      '00962791234567',
      '962791234567',
      '791234567',
      ' 0791234567 ',
      '(079) 1234567',
    ]) {
      expect(normalisePhone(input), `for input ${JSON.stringify(input)}`).toBe(CANONICAL);
    }
  });

  it('is idempotent', () => {
    expect(normalisePhone(normalisePhone('+962 79 123 4567'))).toBe(CANONICAL);
  });

  it('adds the missing leading zero only to a 9-digit number starting 7', () => {
    expect(normalisePhone('791234567')).toBe('0791234567');
    // Not a mobile-shaped number, so it must be left alone rather than mangled.
    expect(normalisePhone('612345678')).toBe('612345678');
  });

  it('strips formatting without inventing digits', () => {
    expect(normalisePhone('')).toBe('');
    expect(normalisePhone('abc')).toBe('');
  });
});

describe('isValidJordanianMobile', () => {
  it('accepts the three real mobile prefixes in any spelling', () => {
    for (const prefix of ['077', '078', '079']) {
      expect(isValidJordanianMobile(`${prefix}1234567`)).toBe(true);
      expect(isValidJordanianMobile(`+962${prefix.slice(1)}1234567`)).toBe(true);
    }
  });

  it('rejects landlines, wrong lengths and non-Jordanian numbers', () => {
    for (const bad of [
      '0761234567',      // 076 is not a mobile prefix
      '079123456',       // one digit short
      '07912345678',     // one digit long
      '062345678',       // landline
      '+9715551234567',  // UAE
      '',
      'not a phone',
    ]) {
      expect(isValidJordanianMobile(bad), `for ${JSON.stringify(bad)}`).toBe(false);
    }
  });
});

describe('governorates', () => {
  it('covers all twelve, with unique keys', () => {
    expect(GOVERNORATES).toHaveLength(12);
    expect(new Set(GOVERNORATES.map((g) => g.value)).size).toBe(12);
  });

  it('has a non-empty Arabic and English label for each', () => {
    for (const g of GOVERNORATES) {
      expect(g.ar.trim()).not.toBe('');
      expect(g.en.trim()).not.toBe('');
    }
  });

  it('accepts known keys and rejects anything else', () => {
    // Checkout turns an unknown governorate into NO_SHIPPING_ZONE rather than
    // free delivery, so this guard matters.
    for (const g of GOVERNORATES) expect(isGovernorate(g.value)).toBe(true);
    for (const bad of ['Amman', 'AMMAN', 'amman ', 'dubai', '']) {
      expect(isGovernorate(bad)).toBe(false);
    }
  });
});
