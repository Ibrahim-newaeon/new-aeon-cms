import { describe, it, expect } from 'vitest';
import {
  neutraliseFormula,
  csvField,
  buildCsv,
  csvFilename,
  submissionsToCsv,
  newsletterToCsv,
  findEmail,
} from '@/lib/forms/csv';

/**
 * These values arrive from a public, unauthenticated form and end up in a file
 * the shop owner opens in Excel. The escaping is the entire point of the module.
 */
describe('formula injection', () => {
  it('neutralises every character a spreadsheet treats as a formula', () => {
    for (const dangerous of ['=1+1', '+1', '-1', '@SUM(A1)', '\tcmd', '\rcmd']) {
      expect(neutraliseFormula(dangerous).startsWith("'"), dangerous).toBe(true);
    }
  });

  it('neutralises a real payload rather than merely escaping quotes', () => {
    const attack = '=HYPERLINK("http://evil.example","click me")';
    const field = csvField(attack);

    expect(field.startsWith('"\'')).toBe(true);
    expect(field).not.toContain('"=HYPERLINK');
  });

  it('leaves ordinary values alone', () => {
    for (const safe of ['Sara', 'sara@example.com', '0791234567', 'عطور', '2026-08-29']) {
      expect(neutraliseFormula(safe), safe).toBe(safe);
    }
  });

  it('only reacts to the FIRST character, not a hyphen inside a value', () => {
    expect(neutraliseFormula('e-mail')).toBe('e-mail');
    expect(neutraliseFormula('Amman-Jordan')).toBe('Amman-Jordan');
    // ...but a leading one is still neutralised.
    expect(neutraliseFormula('-1+1')).toBe("'-1+1");
  });
});

describe('csvField', () => {
  it('always quotes, so a comma cannot split a row', () => {
    expect(csvField('Amman, Jordan')).toBe('"Amman, Jordan"');
  });

  it('doubles an embedded quote, per RFC 4180', () => {
    expect(csvField('she said "hi"')).toBe('"she said ""hi"""');
  });

  it('renders null and undefined as empty, not as the words', () => {
    expect(csvField(null)).toBe('""');
    expect(csvField(undefined)).toBe('""');
  });

  it('keeps a newline inside the quoted field', () => {
    expect(csvField('line one\nline two')).toBe('"line one\nline two"');
  });
});

describe('buildCsv', () => {
  it('starts with a UTF-8 BOM so Excel does not mangle Arabic', () => {
    // Without it Excel reads the file as the local ANSI codepage and every
    // Arabic name arrives as mojibake.
    expect(buildCsv(['a'], [['عطور']]).charCodeAt(0)).toBe(0xfeff);
  });

  it('uses CRLF line endings', () => {
    const csv = buildCsv(['a', 'b'], [['1', '2']]);
    expect(csv).toContain('\r\n');
    expect(csv.trimEnd().split('\r\n')).toHaveLength(2);
  });

  it('emits a header row even with no data', () => {
    expect(buildCsv(['email'], []).trimEnd()).toBe('﻿"email"');
  });
});

describe('csvFilename', () => {
  it('stamps the date and strips anything path-like', () => {
    expect(csvFilename('newsletter', new Date('2026-08-29T12:00:00Z'))).toBe(
      'newsletter-2026-08-29.csv'
    );
    expect(csvFilename('../../etc/passwd', new Date('2026-08-29T12:00:00Z'))).toBe(
      'etcpasswd-2026-08-29.csv'
    );
  });
});

describe('findEmail', () => {
  it('prefers a field whose NAME looks like an email field', () => {
    expect(findEmail({ email: 'a@b.com', other: 'c@d.com' })).toBe('a@b.com');
    expect(findEmail({ 'E-Mail': 'a@b.com' })).toBe('a@b.com');
  });

  it('falls back to a value that looks like an address', () => {
    // The field set is author-configurable, so the name cannot be relied on.
    expect(findEmail({ bareed: 'sara@example.com' })).toBe('sara@example.com');
  });

  it('returns null when there is nothing address-shaped', () => {
    expect(findEmail({ name: 'Sara', phone: '0791234567' })).toBeNull();
    expect(findEmail(null)).toBeNull();
    expect(findEmail({})).toBeNull();
  });

  it('trims surrounding whitespace', () => {
    expect(findEmail({ email: '  a@b.com  ' })).toBe('a@b.com');
  });
});

describe('submissionsToCsv', () => {
  const at = (iso: string) => new Date(iso);

  it('unions the field names across rows, in first-seen order', () => {
    // The payload is jsonb with an author-configurable field set; a fixed
    // column list would silently drop whatever a block was set up to collect.
    const csv = submissionsToCsv([
      { payload: { name: 'A', phone: '1' }, pageSlug: 'p', locale: 'ar', createdAt: at('2026-01-01') },
      { payload: { name: 'B', message: 'hi' }, pageSlug: null, locale: null, createdAt: null },
    ]);

    const header = csv.split('\r\n')[0]!;
    expect(header).toBe('"﻿name","phone","message","page","locale","submitted_at"'.replace('"﻿', '﻿"'));
  });

  it('leaves a missing field empty rather than shifting the row', () => {
    const csv = submissionsToCsv([
      { payload: { a: '1', b: '2' }, pageSlug: null, locale: null, createdAt: null },
      { payload: { a: '3' }, pageSlug: null, locale: null, createdAt: null },
    ]);
    const rows = csv.trimEnd().split('\r\n');

    expect(rows[2]).toBe('"3","","","",""');
  });
});

describe('newsletterToCsv', () => {
  const row = (email: string, iso: string) => ({
    payload: { email },
    pageSlug: null,
    locale: null,
    createdAt: new Date(iso),
  });

  it('deduplicates addresses case-insensitively', () => {
    // A list holding the same address three times sends the same email three
    // times.
    const csv = newsletterToCsv([
      row('a@b.com', '2026-01-02'),
      row('A@B.COM', '2026-01-03'),
      row('c@d.com', '2026-01-04'),
    ]);

    expect(csv.trimEnd().split('\r\n')).toHaveLength(3); // header + 2
  });

  it('keeps the FIRST signup, which is when they actually subscribed', () => {
    const csv = newsletterToCsv([
      row('a@b.com', '2026-03-01'),
      row('a@b.com', '2026-01-01'),
    ]);

    expect(csv).toContain('2026-01-01');
    expect(csv).not.toContain('2026-03-01');
  });

  it('skips submissions with no address at all', () => {
    const csv = newsletterToCsv([
      { payload: { name: 'no address' }, pageSlug: null, locale: null, createdAt: new Date() },
    ]);
    expect(csv.trimEnd().split('\r\n')).toHaveLength(1); // header only
  });
});
