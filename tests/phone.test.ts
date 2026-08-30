// tests/phone.test.ts
import { describe, it, expect } from 'vitest';
import {
  normalisePhone,
  isValidMobile,
  formatPhone,
  isRegionOf,
  isRegionValue,
  JORDAN_GOVERNORATES,
  DEFAULT_COUNTRY,
} from '@/lib/commerce/phone';

const CANONICAL = '+962791234567';

describe('normalisePhone', () => {
  it('collapses every spelling of one Jordanian number onto one value', () => {
    // This value is the customer merge key. If two spellings normalise
    // differently, one person becomes two customers and "what did they order
    // before" silently returns the wrong answer.
    for (const input of [
      '+962791234567', '00962791234567', '962791234567',
      '0791234567', '079 123 4567', '+962 79 123 4567',
      '(079) 123-4567', '079-123-4567', '  0791234567  ',
    ]) {
      expect(normalisePhone(input), `for ${JSON.stringify(input)}`).toBe(CANONICAL);
    }
  });

  it('is idempotent, so re-normalising stored values is safe', () => {
    // The migration re-runs this over rows that may already be E.164.
    expect(normalisePhone(normalisePhone('0791234567'))).toBe(CANONICAL);
  });

  it('keeps the country, so two countries cannot collide on one row', () => {
    // The whole reason for E.164: `079…` is a different person in each place.
    const jo = normalisePhone('0791234567', 'JO');
    const gb = normalisePhone('07912345678', 'GB');
    expect(jo).not.toBe(gb);
    expect(jo.startsWith('+962')).toBe(true);
    expect(gb.startsWith('+44')).toBe(true);
  });

  it('reads an international number regardless of the store country', () => {
    // A Saudi customer of a Jordanian shop types +966 and must be reachable.
    expect(normalisePhone('+966501234567', 'JO')).toBe('+966501234567');
  });

  it('returns empty for things that are not phone numbers', () => {
    // Empty rather than throwing: callers use this to look somebody up, and
    // nonsense should find nobody rather than break a checkout.
    for (const bad of ['', '   ', 'abc', '123', '07', '+']) {
      expect(normalisePhone(bad), `for ${JSON.stringify(bad)}`).toBe('');
    }
  });
});

describe('isValidMobile', () => {
  it('accepts real Jordanian mobiles in any spelling', () => {
    for (const prefix of ['077', '078', '079']) {
      expect(isValidMobile(`${prefix}1234567`)).toBe(true);
      expect(isValidMobile(`+962${prefix.slice(1)}1234567`)).toBe(true);
    }
  });

  it('rejects landlines, short numbers and junk', () => {
    for (const bad of ['0791234', '079123456789', '1234567890', 'not a phone', '']) {
      expect(isValidMobile(bad), `for ${JSON.stringify(bad)}`).toBe(false);
    }
  });

  it('validates against the store country, not a hardcoded Jordan', () => {
    // The point of the change: a shop in another country must be able to take
    // its own customers' numbers.
    expect(isValidMobile('07912345678', 'GB')).toBe(true);
    expect(isValidMobile('0501234567', 'SA')).toBe(true);
    // A Jordanian mobile is not a valid bare local number in the UK.
    expect(isValidMobile('0791234567', 'GB')).toBe(false);
  });
});

describe('formatPhone', () => {
  it('formats for display without changing what is stored', () => {
    expect(formatPhone(CANONICAL)).toBe('+962 7 9123 4567');
    // Unparseable input is handed back untouched rather than blanked.
    expect(formatPhone('not a phone')).toBe('not a phone');
  });
});

describe('shipping regions', () => {
  it('ships Jordan’s twelve governorates as the default list', () => {
    expect(JORDAN_GOVERNORATES).toHaveLength(12);
    expect(new Set(JORDAN_GOVERNORATES.map((g) => g.value)).size).toBe(12);
  });

  it('gives every region both languages', () => {
    for (const g of JORDAN_GOVERNORATES) {
      expect(g.ar.trim().length, g.value).toBeGreaterThan(0);
      expect(g.en.trim().length, g.value).toBeGreaterThan(0);
    }
  });

  it('recognises a value only if the store offers it', () => {
    // This is what stops a zone matching nothing: the editor and the checkout
    // dropdown check membership of the same list.
    expect(isRegionOf(JORDAN_GOVERNORATES, 'amman')).toBe(true);
    expect(isRegionOf(JORDAN_GOVERNORATES, 'riyadh')).toBe(false);
  });

  it('requires region values to be slugs', () => {
    for (const good of ['amman', 'sets-and-packages', 'a1']) {
      expect(isRegionValue(good), good).toBe(true);
    }
    for (const bad of ['Amman', 'a b', '', 'a_b', '-a', 'a-']) {
      expect(isRegionValue(bad), JSON.stringify(bad)).toBe(false);
    }
  });
});

describe('DEFAULT_COUNTRY', () => {
  it('is Jordan, matching the shops this was built for', () => {
    expect(DEFAULT_COUNTRY).toBe('JO');
  });
});
