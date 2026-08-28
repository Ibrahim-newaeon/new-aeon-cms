// lib/media/storage.ts
import { randomUUID } from 'node:crypto';
import type { StorageDriver } from './drivers/types';
import { localDriver } from './drivers/local';
import { s3Driver } from './drivers/s3';

/**
 * Upload facade.
 *
 * Bytes go to a driver (local disk or an S3-compatible bucket); every policy
 * decision stays here. `storeUpload` and `deleteStored` keep the signatures the
 * API routes already call, so switching drivers is an env change and nothing
 * more.
 */

export const MAX_BYTES = 8 * 1024 * 1024; // 8 MB

/**
 * Allow-list, not a block-list. `image/svg+xml` is deliberately EXCLUDED: an SVG
 * is a document that can carry <script>, and it would be served same-origin from
 * our own domain — a stored-XSS vector dressed up as an image.
 */
export const ALLOWED_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/gif': 'gif',
  'application/pdf': 'pdf',
};

export interface StoredFile {
  filename: string;
  url: string;
  thumbnailUrl: string | null;
  width: number | null;
  height: number | null;
  size: number;
  mimeType: string;
}

/**
 * sharp is loaded lazily and treated as optional.
 *
 * It is a native module, and a top-level `import sharp from 'sharp'` throws at
 * module-load time when the binary will not load — a missing optional platform
 * package, a musl/glibc mismatch in a slim container, or a Windows Application
 * Control policy blocking the .node file (all three have been seen). That
 * failure used to take down the whole upload route.
 *
 * Storing the bytes and generating a thumbnail are separate concerns, and only
 * the first one is allowed to fail the request. Without sharp an upload still
 * succeeds; it just carries no dimensions and no thumbnail.
 */
type SharpFactory = (typeof import('sharp'))['default'];

// `undefined` means "not tried yet", `null` means "tried and unavailable".
// Collapsing those two would retry a failing native load on every upload.
let sharpModule: SharpFactory | null | undefined;

async function loadSharp(): Promise<SharpFactory | null> {
  if (sharpModule !== undefined) return sharpModule;

  try {
    const loaded: SharpFactory = (await import('sharp')).default;
    sharpModule = loaded;
    return loaded;
  } catch (error) {
    console.warn(
      'sharp unavailable — uploads will have no thumbnails or dimensions:',
      error instanceof Error ? error.message.split('\n')[0] : error
    );
    sharpModule = null;
    return null;
  }
}

/** Read per-call, not at module load, so scripts can set env before importing. */
export function activeDriver(): StorageDriver {
  return process.env.STORAGE_DRIVER === 's3' ? s3Driver : localDriver;
}

function monthPrefix(): string {
  const now = new Date();
  const y = String(now.getFullYear());
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${y}/${m}`;
}

/**
 * The stored name is generated, never taken from the upload. A user-supplied
 * name could contain `../` or a second extension (`x.php.png`); neither can
 * survive a UUID plus an allow-listed extension.
 */
export async function storeUpload(file: File): Promise<StoredFile> {
  const ext = ALLOWED_MIME[file.type];
  if (!ext) throw new Error('UNSUPPORTED_TYPE');
  if (file.size > MAX_BYTES) throw new Error('TOO_LARGE');

  const driver = activeDriver();
  const buffer = Buffer.from(await file.arrayBuffer());

  const id = randomUUID();
  const prefix = monthPrefix();
  const filename = `${id}.${ext}`;

  const url = await driver.put(`${prefix}/${filename}`, buffer, file.type);

  let width: number | null = null;
  let height: number | null = null;
  let thumbnailUrl: string | null = null;

  const sharp = file.type === 'application/pdf' ? null : await loadSharp();

  if (sharp) {
    try {
      const meta = await sharp(buffer).metadata();
      width = meta.width ?? null;
      height = meta.height ?? null;

      // A 400px webp thumbnail keeps the library grid light even with
      // multi-megabyte originals.
      const thumb = await sharp(buffer)
        .resize(400, 400, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 78 })
        .toBuffer();

      thumbnailUrl = await driver.put(`${prefix}/${id}-thumb.webp`, thumb, 'image/webp');
    } catch {
      // A corrupt or animated image still uploads; it just has no thumbnail.
    }
  }

  return { filename, url, thumbnailUrl, width, height, size: file.size, mimeType: file.type };
}

/**
 * Deletes a stored file.
 *
 * Routes on the URL's shape, NOT on the configured driver. After a switch to
 * s3 the database still holds `/uploads/...` rows from before the migration,
 * and only the local driver can clean those up. A URL matching neither driver
 * is ignored rather than guessed at.
 */
export async function deleteStored(fileUrl: string | null): Promise<void> {
  if (!fileUrl) return;

  for (const driver of [localDriver, s3Driver]) {
    if (driver.owns(fileUrl)) {
      await driver.remove(fileUrl);
      return;
    }
  }
}
