// tests/import-export.test.ts
import { describe, it, expect } from 'vitest';
import { parseCsv, toCsv, toXlsx, parseXlsx, cellRef } from '@/lib/import-export/table';
import { ENTITIES, findEntity, templateFor, headersFor } from '@/lib/import-export/registry';
import { planImport, keyOf, toMinorUnits, fromMinorUnits, parseBoolean } from '@/lib/import-export/plan';

const products = findEntity('products')!;

describe('csv parsing', () => {
  it('keeps commas, quotes and newlines inside a quoted field', () => {
    // Splitting on commas passes the file you test with and corrupts the one
    // the customer sends.
    const table = parseCsv('sku,name\nA-1,"Oud, rich ""deep"" scent\nsecond line"\n');
    expect(table.headers).toEqual(['sku', 'name']);
    expect(table.rows[0]).toEqual(['A-1', 'Oud, rich "deep" scent\nsecond line']);
  });

  it('strips the BOM Excel writes', () => {
    // Left in place it becomes part of the first header, and that column
    // silently stops matching.
    const table = parseCsv('﻿sku,price\nA-1,10\n');
    expect(table.headers).toEqual(['sku', 'price']);
  });

  it('handles CRLF and a trailing newline without inventing a row', () => {
    const table = parseCsv('sku,price\r\nA-1,10\r\n');
    expect(table.rows).toHaveLength(1);
  });

  it('drops fully blank rows', () => {
    // Excel files are full of them, and each one would otherwise be a
    // rejected row the person has to read.
    const table = parseCsv('sku,price\nA-1,10\n,\n\nB-2,20\n');
    expect(table.rows).toHaveLength(2);
  });

  it('round-trips through the writer', () => {
    const original = { headers: ['sku', 'name'], rows: [['A-1', 'Has, comma']] };
    expect(parseCsv(toCsv(original))).toEqual(original);
  });
});

describe('xlsx', () => {
  it('round-trips a table', async () => {
    const original = { headers: ['sku', 'name'], rows: [['A-1', 'Amber Oud'], ['B-2', 'عنبر']] };
    const buffer = await toXlsx(original);
    const parsed = await parseXlsx(
      buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer
    );
    expect(parsed.headers).toEqual(original.headers);
    expect(parsed.rows).toEqual(original.rows);
  });
});

describe('cellRef', () => {
  it('points at the spreadsheet cell a person can go and look at', () => {
    // Row 0 of the data is row 2 of the file: the header is row 1.
    expect(cellRef(0, 0)).toBe('A2');
    expect(cellRef(3, 2)).toBe('C5');
    expect(cellRef(0, 25)).toBe('Z2');
    expect(cellRef(0, 26)).toBe('AA2');
  });
});

describe('entity registry', () => {
  it('every entity has unique column keys', () => {
    for (const entity of ENTITIES) {
      const keys = headersFor(entity);
      expect(new Set(keys).size, entity.id).toBe(keys.length);
    }
  });

  it('every importable entity names a natural key that is a real column', () => {
    // Without one, importing the same file twice duplicates everything.
    for (const entity of ENTITIES) {
      if (!entity.naturalKey) continue;
      for (const part of entity.naturalKey.split('|')) {
        expect(headersFor(entity), entity.id).toContain(part);
      }
    }
  });

  it('customers are export-only', () => {
    // The phone number is the key that decides whether two orders are one
    // person; a spreadsheet must not rewrite it.
    expect(findEntity('customers')!.naturalKey).toBeNull();
  });

  it('the template carries one example row', () => {
    const template = templateFor(products);
    expect(template.headers).toEqual(headersFor(products));
    expect(template.rows).toHaveLength(1);
    expect(template.rows[0]![0]).toBe('AMBER-OUD-50');
  });
});

describe('planImport', () => {
  const sheet = (rows: string[][]) => ({ headers: headersFor(products), rows });
  const row = (over: Partial<Record<string, string>> = {}) => {
    const base: Record<string, string> = {
      sku: 'A-1', slug: 'amber-oud', name_en: 'Amber', name_ar: '', brand: '', category: '',
      price: '129.000', compare_at_price: '', stock: '5', option_name: '', option_value: '',
      active: 'yes',
    };
    return headersFor(products).map((k) => ({ ...base, ...over })[k] ?? '');
  };

  it('splits rows into create and update by the natural key', () => {
    const plan = planImport(products, sheet([row({ sku: 'A-1' }), row({ sku: 'B-2' })]), new Set(['a-1']));
    expect(plan.update.map((u) => u.key)).toEqual(['a-1']);
    expect(plan.create.map((c) => c.sku)).toEqual(['B-2']);
  });

  it('rejects a bad cell and says where it is', () => {
    const plan = planImport(products, sheet([row({ price: 'free' })]), new Set());
    expect(plan.create).toHaveLength(0);
    expect(plan.rejected[0]?.column).toBe('price');
    // Column G, second row of the file.
    expect(plan.rejected[0]?.cell).toBe('G2');
  });

  it('rejects one bad row without losing the good ones', () => {
    // One mistyped price must not reject 500 correct rows.
    const plan = planImport(products, sheet([row({ sku: 'A-1' }), row({ sku: 'B-2', stock: 'lots' })]), new Set());
    expect(plan.create).toHaveLength(1);
    expect(plan.rejected).toHaveLength(1);
  });

  it('rejects a duplicate key within the same file', () => {
    // Applying both means the second silently wins, which looks exactly like
    // the first being ignored.
    const plan = planImport(products, sheet([row({ sku: 'A-1' }), row({ sku: 'A-1' })]), new Set());
    expect(plan.create).toHaveLength(1);
    expect(plan.rejected[0]?.message).toContain('duplicate of row 2');
  });

  it('reports unknown columns instead of ignoring them', () => {
    const table = { headers: [...headersFor(products), 'supplier_note'], rows: [[...row(), 'x']] };
    expect(planImport(products, table, new Set()).unknownColumns).toEqual(['supplier_note']);
  });

  it('refuses the whole file when a required column is missing', () => {
    // Every row would fail identically; 500 copies of one error help nobody.
    const table = { headers: ['slug', 'price', 'stock'], rows: [['amber-oud', '1', '1']] };
    const plan = planImport(products, table, new Set());
    expect(plan.missingColumns).toContain('sku');
    expect(plan.rejected).toHaveLength(0);
    expect(plan.create).toHaveLength(0);
  });

  it('builds a compound key for reviews', () => {
    const reviews = findEntity('reviews')!;
    expect(keyOf(reviews, { product_sku: 'A-1', phone: '0791234567' })).toBe('a-1|0791234567');
    expect(keyOf(reviews, { product_sku: 'A-1', phone: '' })).toBeNull();
  });
});

describe('money', () => {
  it('shifts digits as text rather than multiplying', () => {
    // parseFloat('1.1') * 1000 is 1100.0000000000001, and money that is off by
    // a thousandth of a fils does not reconcile.
    expect(toMinorUnits('1.1', 3)).toBe(1100);
    expect(toMinorUnits('129.000', 3)).toBe(129000);
    expect(toMinorUnits('129', 3)).toBe(129000);
    expect(toMinorUnits('0.005', 3)).toBe(5);
  });

  it('accepts thousands separators, which spreadsheets add', () => {
    expect(toMinorUnits('1,290.50', 2)).toBe(129050);
  });

  it('truncates rather than rounding beyond the currency precision', () => {
    // 129.0009 JOD is not a price; silently rounding it up would overcharge.
    expect(toMinorUnits('129.0009', 3)).toBe(129000);
  });

  it('refuses nonsense', () => {
    for (const bad of ['free', '', 'abc', '1.2.3']) expect(toMinorUnits(bad, 3), bad).toBeNull();
  });

  it('round-trips', () => {
    expect(fromMinorUnits(129000, 3)).toBe('129.000');
    expect(fromMinorUnits(5, 3)).toBe('0.005');
    expect(fromMinorUnits(0, 2)).toBe('0.00');
  });
});

describe('parseBoolean', () => {
  it('accepts what people actually type, in both languages', () => {
    for (const yes of ['yes', 'YES', 'true', '1', 'نعم']) expect(parseBoolean(yes), yes).toBe(true);
    for (const no of ['no', 'false', '0', 'لا']) expect(parseBoolean(no), no).toBe(false);
  });

  it('treats an empty cell as the default rather than as false', () => {
    // A blank "active" column should not deactivate a catalogue.
    expect(parseBoolean('', true)).toBe(true);
  });
});
