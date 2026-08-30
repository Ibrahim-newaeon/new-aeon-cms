// lib/import-export/plan.ts
import { cellRef, type Table } from './table';
import { headersFor, type EntityDef } from './registry';

/**
 * Turning an uploaded sheet into a plan, before anything is written.
 *
 * Every import is a dry run first. A spreadsheet applied straight to a live
 * catalogue is how a mistyped column wipes 400 prices, and the person who
 * uploaded it finds out from a customer.
 */

export interface RowIssue {
  /** 0-based index into the data rows; row 1 of the file is the header. */
  row: number;
  /** Spreadsheet address, so the person can go and look at the cell. */
  cell?: string;
  column?: string;
  message: string;
}

export interface ImportPlan {
  /** Rows that would create a new record. */
  create: Record<string, string>[];
  /** Rows that would change an existing one, with the key they matched on. */
  update: { key: string; values: Record<string, string> }[];
  /** Rows that will not be applied, and why. */
  rejected: RowIssue[];
  /** Headers in the file that the entity does not define. */
  unknownColumns: string[];
  /** Required headers the file is missing entirely. */
  missingColumns: string[];
}

/** `product_sku|phone` → the values joined, so a compound key is one string. */
export function keyOf(entity: EntityDef, row: Record<string, string>): string | null {
  if (!entity.naturalKey) return null;
  const parts = entity.naturalKey.split('|').map((k) => (row[k] ?? '').trim().toLowerCase());
  return parts.every((p) => p !== '') ? parts.join('|') : null;
}

/**
 * Validates a sheet against an entity and sorts every row into create, update
 * or rejected.
 *
 * `existingKeys` is what the caller already has in the database. Passing it in
 * rather than querying here keeps this pure and testable — the interesting
 * logic is the sorting, not the SQL.
 */
export function planImport(
  entity: EntityDef,
  table: Table,
  existingKeys: ReadonlySet<string>
): ImportPlan {
  const known = new Set(headersFor(entity));
  const headerIndex = new Map<string, number>();
  table.headers.forEach((header, i) => {
    // First wins: a duplicated column is a copy-paste artefact, and silently
    // taking the last one means the value the person can see in column B is
    // not the value that was used.
    if (!headerIndex.has(header)) headerIndex.set(header, i);
  });

  const unknownColumns = table.headers.filter((h) => h !== '' && !known.has(h));
  const missingColumns = entity.columns
    .filter((c) => c.required && !headerIndex.has(c.key))
    .map((c) => c.key);

  const plan: ImportPlan = {
    create: [],
    update: [],
    rejected: [],
    unknownColumns,
    missingColumns,
  };

  // A missing required column is a whole-file problem: every row would fail
  // for the same reason, and 500 identical errors help nobody.
  if (missingColumns.length > 0) return plan;

  const seen = new Map<string, number>();

  table.rows.forEach((cells, rowIndex) => {
    const row: Record<string, string> = {};
    for (const column of entity.columns) {
      const at = headerIndex.get(column.key);
      row[column.key] = at === undefined ? '' : (cells[at] ?? '').trim();
    }

    const parsed = entity.rowSchema.safeParse(row);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const column = String(issue.path[0] ?? '');
        const at = headerIndex.get(column);
        plan.rejected.push({
          row: rowIndex,
          column: column || undefined,
          cell: at === undefined ? undefined : cellRef(rowIndex, at),
          message: issue.message,
        });
      }
      return;
    }

    const key = keyOf(entity, row);
    if (!key) {
      plan.rejected.push({ row: rowIndex, message: 'missing the identifying column' });
      return;
    }

    // Two rows claiming the same record: applying both means the second
    // silently wins, which is indistinguishable from the first being ignored.
    const earlier = seen.get(key);
    if (earlier !== undefined) {
      plan.rejected.push({
        row: rowIndex,
        message: `duplicate of row ${earlier + 2} in this file`,
      });
      return;
    }
    seen.set(key, rowIndex);

    if (existingKeys.has(key)) plan.update.push({ key, values: row });
    else plan.create.push(row);
  });

  return plan;
}

/** Truthy strings people actually type, in both languages. */
export function parseBoolean(value: string, fallback = true): boolean {
  const v = value.trim().toLowerCase();
  if (v === '') return fallback;
  return ['true', 'yes', '1', 'نعم'].includes(v);
}

/**
 * "129.000" → 129000 minor units.
 *
 * Never parseFloat-then-multiply: 1.1 * 1000 is 1100.0000000000001, and money
 * that is off by a thousandth of a fils is money that fails to reconcile. The
 * digits are shifted as text instead.
 */
export function toMinorUnits(value: string, exponent: number): number | null {
  const cleaned = value.trim().replace(/,/g, '');
  if (!/^-?\d*\.?\d+$/.test(cleaned)) return null;

  const negative = cleaned.startsWith('-');
  const [whole = '0', fraction = ''] = cleaned.replace('-', '').split('.');
  const padded = (fraction + '0'.repeat(exponent)).slice(0, exponent);
  const minor = Number(`${whole}${padded}`);
  if (!Number.isSafeInteger(minor)) return null;
  return negative ? -minor : minor;
}

/** The inverse, for export. */
export function fromMinorUnits(value: number, exponent: number): string {
  const negative = value < 0;
  const digits = String(Math.abs(value)).padStart(exponent + 1, '0');
  const whole = digits.slice(0, digits.length - exponent);
  const fraction = exponent === 0 ? '' : `.${digits.slice(digits.length - exponent)}`;
  return `${negative ? '-' : ''}${whole}${fraction}`;
}
