// app/api/media/[id]/download/route.ts
import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { mediaAssets } from '@/lib/db/schema';

export const runtime = 'nodejs';

/**
 * Serves a media asset as a DOWNLOAD rather than a view.
 *
 * Files under /uploads are served statically, which means a PDF opens in the
 * browser's viewer and a spreadsheet may too. A Resources page offering "spec
 * sheet (PDF)" should put the file in the reader's downloads folder, and that
 * is a Content-Disposition the static route cannot set.
 *
 * Public on purpose: these are documents a shop is publishing. The id is a
 * UUID rather than a guessable path, and only assets already in the library
 * can be fetched — this is not an arbitrary file proxy.
 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;

  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ success: false, error: { message: 'Not found' } }, { status: 404 });
  }

  const [asset] = await db
    .select({
      url: mediaAssets.url,
      originalName: mediaAssets.originalName,
      mimeType: mediaAssets.mimeType,
    })
    .from(mediaAssets)
    .where(eq(mediaAssets.id, id))
    .limit(1);

  if (!asset) {
    return NextResponse.json({ success: false, error: { message: 'Not found' } }, { status: 404 });
  }

  // Absolute for S3/R2, relative for local disk. Resolved against this request
  // so a local file is fetched from our own origin rather than guessed at.
  const source = /^https?:\/\//i.test(asset.url)
    ? asset.url
    : new URL(asset.url, _request.url).toString();

  const upstream = await fetch(source);
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ success: false, error: { message: 'File is unavailable' } }, { status: 502 });
  }

  /**
   * The filename is quoted and stripped of quotes and control characters: an
   * original name is user input, and an unescaped `"` in a Content-Disposition
   * header is a header-injection vector. filename* carries the UTF-8 form so
   * an Arabic document keeps its name.
   */
  const safe = asset.originalName.replace(/["\\\r\n]/g, '').slice(0, 200) || 'download';
  const encoded = encodeURIComponent(safe);

  return new NextResponse(upstream.body, {
    headers: {
      'Content-Type': asset.mimeType || 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${safe}"; filename*=UTF-8''${encoded}`,
      // The browser must not sniff a document into something executable.
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
