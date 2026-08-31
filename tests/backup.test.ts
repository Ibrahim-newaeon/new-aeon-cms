// tests/backup.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { BACKUP_TABLES, EXCLUDED_TABLES, REDACTED_COLUMNS } from '@/lib/backup/tables';

/**
 * The allow-list is the security boundary. A table added to the schema and
 * forgotten here is the failure mode worth catching, in either direction:
 * silently absent from a client's backup, or silently included when it holds
 * live credentials.
 */
const schema = readFileSync('lib/db/schema.ts', 'utf8');
const schemaTables = [...schema.matchAll(/pgTable\(\s*'([a-z_]+)'/g)].map((m) => m[1]!);

describe('backup coverage', () => {
  it('every table in the schema is either backed up or explicitly excluded', () => {
    const decided = new Set<string>([...BACKUP_TABLES, ...Object.keys(EXCLUDED_TABLES)]);
    const undecided = schemaTables.filter((t) => !decided.has(t));

    expect(
      undecided,
      `Add to BACKUP_TABLES or EXCLUDED_TABLES in lib/backup/tables.ts:\n  ${undecided.join('\n  ')}`
    ).toEqual([]);
  });

  it('names a reason for every exclusion', () => {
    // A table left out without a stated reason is indistinguishable from one
    // left out by accident.
    for (const [table, reason] of Object.entries(EXCLUDED_TABLES)) {
      expect(reason.length, table).toBeGreaterThan(20);
    }
  });

  it('excludes every table that holds a live credential', () => {
    for (const secret of ['refresh_tokens', 'password_reset_tokens', 'customer_otp']) {
      expect(BACKUP_TABLES, `${secret} must not be in a downloadable file`).not.toContain(secret);
      expect(Object.keys(EXCLUDED_TABLES)).toContain(secret);
    }
  });

  it('backs up the things a client would leave with', () => {
    // The point of the feature. If these are missing, "you are not locked in"
    // is not true.
    for (const table of [
      'content', 'content_i18n', 'products', 'product_i18n', 'orders',
      'customers', 'media_assets', 'settings',
    ]) {
      expect(BACKUP_TABLES, `${table} missing from the backup`).toContain(table);
    }
  });

  it('redacts password hashes from the users table', () => {
    // Included so accounts can be re-created; hashes dropped because a backup
    // is copied, emailed, and left on laptops.
    expect(BACKUP_TABLES).toContain('users');
    expect(REDACTED_COLUMNS.users).toContain('password_hash');
  });

  it('lists no table twice', () => {
    expect(new Set(BACKUP_TABLES).size).toBe(BACKUP_TABLES.length);
  });

  it('does not both include and exclude the same table', () => {
    const both = BACKUP_TABLES.filter((t) => t in EXCLUDED_TABLES);
    expect(both).toEqual([]);
  });
});
