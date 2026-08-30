// lib/import-export/table.ts
import { buildCsv } from '@/lib/forms/csv';

/**
 * The one shape every import and export passes through.
 *
 * Entities describe columns; formats read and write this. Neither knows about
 * the other, so adding a format does not touch the entities and adding an
 * entity does not touch the formats.
 */
export interface Table {
  headers: string[];
  rows: string[][];
}

/** A cell address, for pointing at the exact place a row went wrong. */
export const cellRef = (rowIndex: number, columnIndex: number) => {
  let column = '';
  let n = columnIndex;
  do {
    column = String.fromCharCode(65 + (n % 26)) + column;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  // +2: the header occupies row 1, and spreadsheet rows are 1-based.
  return `${column}${rowIndex + 2}`;
};

/**
 * RFC 4180 CSV, parsed properly rather than split on commas.
 *
 * A quoted field can contain commas, newlines and escaped quotes, and product
 * descriptions contain all three. Splitting on commas works on the file you
 * test with and corrupts the one the customer sends.
 */
export function parseCsv(text: string): Table {
  // Excel writes a BOM; left in place it becomes part of the first header and
  // that column silently stops matching.
  const input = text.replace(/^﻿/, '');

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < input.length; i++) {
    const char = input[i]!;

    if (quoted) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (char !== '\r') {
      field += char;
    }
  }

  // Whatever is still buffered is the last field, unless the file ended on a
  // newline and there is nothing pending.
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const nonEmpty = rows.filter((r) => r.some((cell) => cell.trim() !== ''));
  const headers = (nonEmpty.shift() ?? []).map((h) => h.trim());
  return { headers, rows: nonEmpty };
}

export function toCsv(table: Table): string {
  // Reuses the existing writer, which already emits a UTF-8 BOM and CRLF for
  // Excel and neutralises formula-injection characters — a value beginning
  // `=` or `+` is code to a spreadsheet, and these come from user input.
  return buildCsv(table.headers, table.rows);
}

/**
 * XLSX, read server-side only.
 *
 * exceljs rather than the npm `xlsx` package: that one is pinned at 0.18.5 with
 * known prototype-pollution and ReDoS advisories, and this parses files a
 * stranger emailed to a shop owner.
 */
export async function parseXlsx(buffer: ArrayBuffer): Promise<Table> {
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const sheet = workbook.worksheets[0];
  if (!sheet) return { headers: [], rows: [] };

  const raw: string[][] = [];
  sheet.eachRow({ includeEmpty: false }, (excelRow) => {
    const cells: string[] = [];
    // `values` is 1-based with a hole at index 0, which is the classic way to
    // lose the first column.
    const values = excelRow.values as unknown[];
    for (let i = 1; i < values.length; i++) {
      cells.push(cellToString(values[i]));
    }
    raw.push(cells);
  });

  const nonEmpty = raw.filter((r) => r.some((cell) => cell.trim() !== ''));
  const headers = (nonEmpty.shift() ?? []).map((h) => h.trim());
  return { headers, rows: nonEmpty };
}

/**
 * Excel hands back dates, formulas, rich text and hyperlinks as objects. A bare
 * String() on those yields "[object Object]", which then fails validation with
 * a message nobody can act on.
 */
function cellToString(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object') {
    const cell = value as Record<string, unknown>;
    if (typeof cell.text === 'string') return cell.text;
    if (typeof cell.result === 'string' || typeof cell.result === 'number') {
      return String(cell.result);
    }
    if (Array.isArray(cell.richText)) {
      return cell.richText.map((part) => String((part as { text?: string }).text ?? '')).join('');
    }
    if (cell.hyperlink && typeof cell.hyperlink === 'string') return cell.hyperlink;
    return '';
  }
  return String(value);
}

export async function toXlsx(table: Table, sheetName = 'Sheet1'): Promise<Buffer> {
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName.slice(0, 31));

  sheet.addRow(table.headers);
  for (const row of table.rows) sheet.addRow(row);

  // Header styled and frozen: an import template is read by a person, and a
  // 30-column sheet without a frozen header is unusable past column H.
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.columns.forEach((column, i) => {
    const header = table.headers[i] ?? '';
    column.width = Math.min(40, Math.max(12, header.length + 4));
  });

  const out = await workbook.xlsx.writeBuffer();
  return Buffer.from(out);
}

export type TableFormat = 'csv' | 'xlsx';

export function isTableFormat(value: string | null): value is TableFormat {
  return value === 'csv' || value === 'xlsx';
}

/** Reads whichever format was uploaded, chosen by content rather than by name. */
export async function parseUpload(file: {
  name: string;
  type: string;
  arrayBuffer(): Promise<ArrayBuffer>;
}): Promise<Table> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer.slice(0, 4));

  // XLSX is a zip: "PK\x03\x04". Sniffed rather than trusting the extension,
  // because a spreadsheet saved as .csv and a .xlsx renamed by hand are both
  // things people actually send.
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b;
  if (isZip) return parseXlsx(buffer);

  if (/\.(docx?|odt)$/i.test(file.name)) {
    throw new Error(
      'Word documents are not supported. Save the table as CSV or Excel (.xlsx) and upload that.'
    );
  }

  return parseCsv(new TextDecoder('utf-8').decode(buffer));
}
