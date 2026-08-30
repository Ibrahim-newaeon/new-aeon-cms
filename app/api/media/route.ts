// app/api/media/route.ts
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { mediaAssets } from '@/lib/db/schema';
import { desc } from 'drizzle-orm';
import { requireApiAuth } from '@/lib/auth/api-guard';
import { storeUpload, ALLOWED_MIME, maxBytesFor } from '@/lib/media/storage';

// Uploads need the Node runtime for fs and sharp.
export const runtime = 'nodejs';

export async function GET(request: Request) {
  const auth = await requireApiAuth(request, ['admin', 'editor', 'author']);
  if (!auth.ok) return auth.response;

  const rows = await db
    .select()
    .from(mediaAssets)
    .orderBy(desc(mediaAssets.createdAt))
    .limit(200);

  return NextResponse.json({ success: true, data: rows });
}

export async function POST(request: Request) {
  const auth = await requireApiAuth(request, ['admin', 'editor', 'author']);
  if (!auth.ok) return auth.response;

  try {
    const form = await request.formData();
    const files = form.getAll('file').filter((f): f is File => f instanceof File);

    if (files.length === 0) {
      return NextResponse.json(
        { success: false, error: { code: 'NO_FILE' } },
        { status: 400 }
      );
    }

    const created = [];
    /**
     * Codes, not sentences.
     *
     * These used to be Arabic strings built here and rendered verbatim, so an
     * English admin was told why its upload failed in Arabic — and the size in
     * the message was a literal "8 ميغابايت" that no longer matched the limit
     * once video got its own cap. The client owns the wording and reads the
     * number from the same constant the check uses.
     */
    const rejected: { name: string; code: 'UNSUPPORTED_TYPE' | 'TOO_LARGE'; limitBytes?: number }[] =
      [];

    for (const file of files) {
      // Report per-file so one bad file does not fail the whole batch.
      if (!ALLOWED_MIME[file.type]) {
        rejected.push({ name: file.name, code: 'UNSUPPORTED_TYPE' });
        continue;
      }
      const limitBytes = maxBytesFor(file.type);
      if (file.size > limitBytes) {
        rejected.push({ name: file.name, code: 'TOO_LARGE', limitBytes });
        continue;
      }

      const stored = await storeUpload(file);

      const [row] = await db
        .insert(mediaAssets)
        .values({
          filename: stored.filename,
          originalName: file.name.slice(0, 255),
          mimeType: stored.mimeType,
          size: stored.size,
          url: stored.url,
          thumbnailUrl: stored.thumbnailUrl,
          width: stored.width,
          height: stored.height,
          uploadedBy: auth.user.sub,
        })
        .returning();

      if (row) created.push(row);
    }

    return NextResponse.json({ success: true, data: created, rejected });
  } catch (error) {
    console.error('Media upload error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'UPLOAD_FAILED' } },
      { status: 500 }
    );
  }
}
