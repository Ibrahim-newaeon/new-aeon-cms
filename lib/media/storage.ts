// lib/media/storage.ts
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';

/**
 * Local-disk storage for uploads.
 *
 * UPLOAD_DIR is a filesystem path; the browser needs a URL. Those are two
 * different things and conflating them is why the previous drafts had no
 * working pipeline. Files land under `<UPLOAD_DIR>/<yyyy>/<mm>/` and are served
 * from `/uploads/<yyyy>/<mm>/` because Next serves `public/` at the web root.
 */
const UPLOAD_DIR = process.env.UPLOAD_DIR || './public/uploads';

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

function monthSegments(): { dir: string; url: string } {
  const now = new Date();
  const y = String(now.getFullYear());
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return { dir: path.join(y, m), url: `${y}/${m}` };
}

/**
 * The stored name is generated, never taken from the upload. A user-supplied
 * name could contain `../` or a second extension (`x.php.png`); neither can
 * survive a UUID + allow-listed extension.
 */
export async function storeUpload(file: File): Promise<StoredFile> {
  const ext = ALLOWED_MIME[file.type];
  if (!ext) throw new Error('UNSUPPORTED_TYPE');
  if (file.size > MAX_BYTES) throw new Error('TOO_LARGE');

  const buffer = Buffer.from(await file.arrayBuffer());
  const { dir, url } = monthSegments();
  const targetDir = path.join(UPLOAD_DIR, dir);
  await mkdir(targetDir, { recursive: true });

  const id = randomUUID();
  const filename = `${id}.${ext}`;
  await writeFile(path.join(targetDir, filename), buffer);

  let width: number | null = null;
  let height: number | null = null;
  let thumbnailUrl: string | null = null;

  if (file.type !== 'application/pdf') {
    try {
      const meta = await sharp(buffer).metadata();
      width = meta.width ?? null;
      height = meta.height ?? null;

      // A 400px webp thumbnail keeps the library grid light even with
      // multi-megabyte originals.
      const thumbName = `${id}-thumb.webp`;
      await sharp(buffer)
        .resize(400, 400, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 78 })
        .toFile(path.join(targetDir, thumbName));
      thumbnailUrl = `/uploads/${url}/${thumbName}`;
    } catch {
      // A corrupt or animated image still uploads; it just has no thumbnail.
    }
  }

  return {
    filename,
    url: `/uploads/${url}/${filename}`,
    thumbnailUrl,
    width,
    height,
    size: file.size,
    mimeType: file.type,
  };
}

/**
 * Deletes a stored file. The URL is re-derived against UPLOAD_DIR and checked to
 * stay inside it, so a tampered `/uploads/../../etc/passwd` cannot escape.
 */
export async function deleteStored(fileUrl: string | null): Promise<void> {
  if (!fileUrl || !fileUrl.startsWith('/uploads/')) return;

  const relative = fileUrl.slice('/uploads/'.length);
  const root = path.resolve(UPLOAD_DIR);
  const target = path.resolve(root, relative);

  if (!target.startsWith(root + path.sep)) return; // traversal attempt

  try {
    await unlink(target);
  } catch {
    // Already gone — deleting the DB row is still the right outcome.
  }
}
