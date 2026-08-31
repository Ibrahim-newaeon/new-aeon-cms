// lib/backup/export.ts
import 'server-only';
/**
 * Pinned to the v5 line, which is also the version exceljs already depends on
 * — so this adds no second copy to the tree. v8 replaced the callable factory
 * with named classes and has no matching @types, which is a rewrite for no
 * gain here.
 */
import archiver from 'archiver';
import { PassThrough, Readable } from 'node:stream';
import { createReadStream, existsSync } from 'node:fs';
import { join, normalize } from 'node:path';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { BACKUP_TABLES, EXCLUDED_TABLES, REDACTED_COLUMNS } from './tables';
import { env } from '@/lib/env';

/**
 * Everything a client owns, in one file they can walk away with.
 *
 * The pitch this exists to make good on is "you are not locked in", and a
 * claim like that is only worth anything if it is demonstrable. So: open
 * formats, the media files themselves rather than links to them, and a
 * manifest that says what is inside.
 *
 * What this is NOT is a disaster-recovery snapshot. It is a portable copy of
 * the data — no session tokens, no password hashes, no sequence positions. For
 * restoring a broken server, `pg_dump` remains the right tool and the README
 * inside the archive says so rather than letting someone find out later.
 *
 * Streamed rather than assembled in memory: media alone is already megabytes,
 * and a backup that only works while the catalogue is small is a backup that
 * fails on the day it matters.
 */

export interface BackupSummary {
  tables: Record<string, number>;
  mediaFiles: number;
  mediaBytes: number;
  skipped: string[];
}

/** JSON rather than CSV: block trees, settings and jsonb columns are nested,
 *  and flattening them into cells is exactly how a "backup" loses content. */
async function readTable(table: string): Promise<Record<string, unknown>[]> {
  const redacted = REDACTED_COLUMNS[table] ?? [];
  const result = await db.execute(sql.raw(`select * from ${table}`));
  const rows = result.rows as unknown as Record<string, unknown>[];

  if (redacted.length === 0) return rows;
  return rows.map((row) => {
    const copy = { ...row };
    for (const column of redacted) delete copy[column];
    return copy;
  });
}

/** Local uploads live under public/; anything absolute belongs to S3/R2. */
function localPathFor(url: string): string | null {
  if (/^https?:\/\//i.test(url)) return null;
  const uploadDir = env.UPLOAD_DIR ?? './public/uploads';
  const base = uploadDir.replace(/^\.\//, '').replace(/\/uploads\/?$/, '');
  // normalize() plus the prefix check keeps a crafted media URL from reaching
  // outside the upload directory.
  const full = normalize(join(process.cwd(), base, url.replace(/^\//, '')));
  const root = normalize(join(process.cwd(), base));
  if (!full.startsWith(root)) return null;
  return existsSync(full) ? full : null;
}

export function createBackupStream(siteName: string): {
  stream: Readable;
  done: Promise<BackupSummary>;
} {
  const archive = archiver('zip', { zlib: { level: 9 } });
  const out = new PassThrough();
  archive.pipe(out);

  const summary: BackupSummary = { tables: {}, mediaFiles: 0, mediaBytes: 0, skipped: [] };

  const done = (async () => {
    for (const table of BACKUP_TABLES) {
      try {
        const rows = await readTable(table);
        summary.tables[table] = rows.length;
        archive.append(JSON.stringify(rows, null, 2), { name: `data/${table}.json` });
      } catch (error) {
        // One unreadable table must not cost the client the other forty.
        summary.skipped.push(table);
        console.error(`Backup: skipped ${table}:`, error);
      }
    }

    // The files themselves, not just the rows describing them. A media library
    // exported as URLs is a list of things you no longer have.
    const media = (await db.execute(
      sql`select url, size from media_assets order by created_at`
    )).rows as unknown as { url: string; size: number }[];

    for (const asset of media) {
      const path = localPathFor(asset.url);
      if (!path) {
        summary.skipped.push(`media:${asset.url}`);
        continue;
      }
      archive.append(createReadStream(path), { name: `media${asset.url}` });
      summary.mediaFiles += 1;
      summary.mediaBytes += asset.size ?? 0;
    }

    const generatedAt = new Date().toISOString();

    archive.append(
      JSON.stringify(
        {
          format: 'new-aeon-backup',
          formatVersion: 1,
          generatedAt,
          site: siteName,
          tables: summary.tables,
          media: { files: summary.mediaFiles, bytes: summary.mediaBytes },
          excludedTables: EXCLUDED_TABLES,
          redactedColumns: REDACTED_COLUMNS,
          skipped: summary.skipped,
        },
        null,
        2
      ),
      { name: 'manifest.json' }
    );

    archive.append(readme(siteName, generatedAt, summary), { name: 'README.md' });

    await archive.finalize();
    return summary;
  })();

  return { stream: out, done };
}

function readme(site: string, generatedAt: string, summary: BackupSummary): string {
  const rows = Object.values(summary.tables).reduce((a, b) => a + b, 0);
  return `# ${site} — data export

Generated ${generatedAt}

## What this is

Everything stored in this site: content, products, orders, customers, media
files and settings. Open formats, no proprietary container. It is yours, and it
is meant to be readable without this software.

- \`manifest.json\` — what is inside, and what was deliberately left out
- \`data/*.json\` — one file per table, ${rows} rows in total
- \`media/\` — ${summary.mediaFiles} uploaded files, at the same paths the data refers to

JSON rather than CSV because page content, settings and product options are
nested structures. A spreadsheet cell cannot hold a block tree without losing
it. Per-entity CSV and Excel exports are available separately in the admin
under each list.

## What this is NOT

A database snapshot. Deliberately absent:

${Object.entries(EXCLUDED_TABLES).map(([t, why]) => `- \`${t}\` — ${why}`).join('\n')}

Password hashes are also omitted, so restoring this re-creates staff accounts
without their passwords; they sign in again via password reset.

**For disaster recovery, use \`pg_dump\`.** This file is for portability — for
moving to another host, handing data to a client, or keeping an independent
copy. It is not a substitute for backing up the database itself.
`;
}
