// app/uploads/[...path]/route.ts
// Serves media from UPLOAD_DIR when that directory is not inside public/.
//
// The local storage driver returns `/uploads/<key>` for every file it writes,
// and the comment above it explains why that works: "Next serves public/ at the
// web root". That holds only while UPLOAD_DIR is left at its default. Point it
// at a mounted volume — the one arrangement where uploads actually survive a
// deploy — and the files land somewhere Next has never heard of. They persist
// perfectly and 404 for every visitor.
//
// Theme packs already had this route (app/theme-assets/[themeId]/[...path]);
// uploads did not, which is the whole gap. This closes it with the same shape:
// no directory listing, an extension allow-list, and a resolved-path check.
//
// Inert when UPLOAD_DIR is the default, because Next serves public/ before it
// reaches a route handler. Inert on S3 too — those rows carry bucket URLs and
// never reach this path.

import { NextResponse } from 'next/server';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { ALLOWED_MIME } from '@/lib/media/limits';

/**
 * Extension → MIME, inverted from the upload allow-list rather than written
 * out again. One table decides what may be stored and what may be served; a
 * second copy would drift, and the direction it drifts in is serving something
 * the uploader was never willing to accept.
 */
const MIME_BY_EXT: Record<string, string> = Object.fromEntries(
  Object.entries(ALLOWED_MIME).map(([mime, ext]) => [`.${ext}`, mime])
);

function uploadRoot(): string {
  return path.resolve(process.env.UPLOAD_DIR || './public/uploads');
}

type Ctx = { params: Promise<{ path: string[] }> };

export async function GET(_request: Request, ctx: Ctx) {
  const { path: parts } = await ctx.params;

  if (!parts?.length) {
    return new NextResponse('Not found', { status: 404 });
  }
  // `..` and backslashes never appear in a key this app wrote — every one is
  // `<YYYY>/<MM>/<uuid>.<ext>` — so anything carrying them is someone probing.
  if (parts.some((p) => !p || p === '..' || p.includes('\\'))) {
    return new NextResponse('Not found', { status: 404 });
  }

  const rel = parts.join('/');
  const ext = path.extname(rel).toLowerCase();
  const mime = MIME_BY_EXT[ext];
  if (!mime) {
    return new NextResponse('Not found', { status: 404 });
  }

  const root = uploadRoot();
  const file = path.resolve(root, rel);
  // Checking after resolve is the only ordering that works — inspecting the
  // string first can be defeated by encoding. Same reasoning as the local
  // driver's remove().
  if (!file.startsWith(root + path.sep)) {
    return new NextResponse('Not found', { status: 404 });
  }

  let data: Buffer;
  try {
    data = await fs.readFile(file);
  } catch {
    return new NextResponse('Not found', { status: 404 });
  }

  return new NextResponse(new Uint8Array(data), {
    status: 200,
    headers: {
      'Content-Type': mime,
      /*
       * Immutable, and a year of it. Stored names are a UUID plus an
       * extension, so a given URL can only ever return the same bytes —
       * replacing an image produces a new row with a new name. Theme assets
       * settle for an hour because their path is the theme id and a re-upload
       * of the same pack reuses it.
       */
      'Cache-Control': 'public, max-age=31536000, immutable',
      /*
       * These are visitor-supplied bytes served from our own origin. A browser
       * that sniffs a .png into text/html has been handed stored XSS, and the
       * upload allow-list is not a content check — it trusts the declared type.
       */
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
    },
  });
}
