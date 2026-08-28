// scripts/migrate-media-to-s3.ts
//
// Copies every media_assets row still pointing at local disk into the
// configured bucket and rewrites its url / thumbnailUrl.
//
//   npm run media:migrate -- --dry-run     inspect, change nothing
//   npm run media:migrate                  do it
//
// Idempotent: rows already on the bucket are skipped, so a failed run can be
// re-run. Local files are COPIED, never deleted — removing the originals is a
// manual step once the bucket is verified.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { db } from '../lib/db';
import { mediaAssets } from '../lib/db/schema';
import { eq } from 'drizzle-orm';
import { s3Driver } from '../lib/media/drivers/s3';

const DRY_RUN = process.argv.includes('--dry-run');
const LOCAL_PREFIX = '/uploads/';

function contentTypeFor(key: string): string {
  const ext = path.extname(key).toLowerCase();
  const map: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.avif': 'image/avif',
    '.gif': 'image/gif',
    '.pdf': 'application/pdf',
  };
  return map[ext] ?? 'application/octet-stream';
}

/**
 * Returns the new URL, or null when the file could not be read.
 *
 * A missing local file is reported rather than fatal: rows orphaned by an
 * earlier deploy are exactly what this migration exists to stop happening
 * again, and there is nothing left to copy for them.
 */
async function migrateOne(url: string, uploadRoot: string): Promise<string | null> {
  const key = url.slice(LOCAL_PREFIX.length);
  const source = path.resolve(uploadRoot, key);

  let body: Buffer;
  try {
    body = await readFile(source);
  } catch {
    console.warn(`  ! missing on disk, skipping: ${source}`);
    return null;
  }

  if (DRY_RUN) return `${url}  ->  (would upload ${body.length} bytes)`;
  return s3Driver.put(key, body, contentTypeFor(key));
}

async function main() {
  if (process.env.STORAGE_DRIVER !== 's3') {
    throw new Error('STORAGE_DRIVER must be s3 to run this migration');
  }

  const uploadRoot = process.env.UPLOAD_DIR || './public/uploads';
  const rows = await db.select().from(mediaAssets);

  console.log(`${rows.length} media rows; upload root ${path.resolve(uploadRoot)}`);
  if (DRY_RUN) console.log('DRY RUN — nothing will be written\n');

  let moved = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows) {
    const needsUrl = row.url.startsWith(LOCAL_PREFIX);
    const needsThumb = row.thumbnailUrl?.startsWith(LOCAL_PREFIX) ?? false;

    if (!needsUrl && !needsThumb) {
      skipped += 1;
      continue;
    }

    console.log(`- ${row.originalName}`);

    const nextUrl = needsUrl ? await migrateOne(row.url, uploadRoot) : null;
    const nextThumb =
      needsThumb && row.thumbnailUrl ? await migrateOne(row.thumbnailUrl, uploadRoot) : null;

    if (needsUrl && !nextUrl) {
      failed += 1;
      continue;
    }

    if (!DRY_RUN) {
      // Only the fields that actually moved are rewritten. A row whose original
      // migrated but whose thumbnail was missing keeps a working original.
      const patch: Partial<typeof mediaAssets.$inferInsert> = {};
      if (nextUrl) patch.url = nextUrl;
      if (nextThumb) patch.thumbnailUrl = nextThumb;

      if (Object.keys(patch).length > 0) {
        await db.update(mediaAssets).set(patch).where(eq(mediaAssets.id, row.id));
      }
    }

    console.log(`    ${nextUrl ?? '(url unchanged)'}`);
    moved += 1;
  }

  console.log(`\nDone. migrated ${moved}, already remote ${skipped}, failed ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
