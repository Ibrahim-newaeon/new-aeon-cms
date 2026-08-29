// lib/forms/csv.ts

/**
 * CSV building for form-submission exports.
 *
 * Pure and dependency-free so it can be tested directly — the escaping rules
 * below are the whole point of the module and are easy to get subtly wrong.
 */

/**
 * Neutralises a value that a spreadsheet would execute.
 *
 * Excel, LibreOffice and Sheets all treat a cell beginning `=`, `+`, `-` or `@`
 * as a formula. These values come from a PUBLIC, UNAUTHENTICATED form, so a
 * submission of `=HYPERLINK("http://evil","click")` — or worse, a `cmd|'/c ...'`
 * DDE payload — becomes live content the moment the shop owner opens the export.
 *
 * Prefixing with a single quote is the standard neutralisation: the leading
 * character makes it text, and spreadsheets hide the quote itself.
 *
 * Tab and carriage return are included because a leading one lets the dangerous
 * character through as the first *rendered* character.
 */
export function neutraliseFormula(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

/**
 * Quotes one field.
 *
 * Always quoted rather than only when necessary: it costs a few bytes and
 * removes an entire class of "worked until someone typed a comma" bug. An
 * embedded quote is doubled, per RFC 4180.
 */
export function csvField(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  return `"${neutraliseFormula(text).replace(/"/g, '""')}"`;
}

export function csvRow(values: unknown[]): string {
  return values.map(csvField).join(',');
}

/**
 * Builds a complete CSV document.
 *
 * CRLF line endings and a UTF-8 BOM, both for Excel: without the BOM it reads
 * the file as the local ANSI codepage and every Arabic name arrives as mojibake,
 * which is the single most likely way this export gets reported as broken.
 */
export function buildCsv(headers: string[], rows: unknown[][]): string {
  const body = [csvRow(headers), ...rows.map(csvRow)].join('\r\n');
  return `﻿${body}\r\n`;
}

/** Safe filename for a Content-Disposition header. */
export function csvFilename(prefix: string, when: Date): string {
  const stamp = when.toISOString().slice(0, 10);
  return `${prefix.replace(/[^a-z0-9-]/gi, '')}-${stamp}.csv`;
}

export interface SubmissionForExport {
  payload: Record<string, string> | null;
  pageSlug: string | null;
  locale: string | null;
  createdAt: Date | null;
}

/**
 * Flattens submissions into a table.
 *
 * The payload is jsonb with an author-configurable field set, so the columns
 * are the union of every key present, in first-seen order. A fixed column list
 * would silently drop whatever a block was configured to collect.
 */
export function submissionsToCsv(rows: SubmissionForExport[]): string {
  const fieldNames: string[] = [];
  for (const row of rows) {
    for (const key of Object.keys(row.payload ?? {})) {
      if (!fieldNames.includes(key)) fieldNames.push(key);
    }
  }

  const headers = [...fieldNames, 'page', 'locale', 'submitted_at'];

  const body = rows.map((row) => [
    ...fieldNames.map((name) => row.payload?.[name] ?? ''),
    row.pageSlug ?? '',
    row.locale ?? '',
    row.createdAt ? row.createdAt.toISOString() : '',
  ]);

  return buildCsv(headers, body);
}

/**
 * Newsletter signups, one row per address.
 *
 * Deduplicated because a subscriber list with the same address three times is a
 * list that will send the same email three times. The FIRST signup is kept —
 * that is when they actually subscribed.
 */
export function newsletterToCsv(rows: SubmissionForExport[]): string {
  const seen = new Set<string>();
  const unique: { email: string; row: SubmissionForExport }[] = [];

  // Oldest first, so "first signup wins" falls out of the iteration order.
  const ordered = [...rows].sort(
    (a, b) => (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0)
  );

  for (const row of ordered) {
    const email = findEmail(row.payload);
    if (!email) continue;

    const key = email.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    unique.push({ email, row });
  }

  return buildCsv(
    ['email', 'page', 'locale', 'subscribed_at'],
    unique.map(({ email, row }) => [
      email,
      row.pageSlug ?? '',
      row.locale ?? '',
      row.createdAt ? row.createdAt.toISOString() : '',
    ])
  );
}

/**
 * Finds the address in an author-configured payload.
 *
 * The field could be named `email`, `Email`, `e-mail` or `bareed`; matching on
 * the value's shape as a fallback is more reliable than insisting on a name.
 */
export function findEmail(payload: Record<string, string> | null): string | null {
  if (!payload) return null;

  for (const [key, value] of Object.entries(payload)) {
    if (/e-?mail/i.test(key) && value?.trim()) return value.trim();
  }

  for (const value of Object.values(payload)) {
    const text = value?.trim();
    if (text && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) return text;
  }

  return null;
}
