// app/api/media/[id]/route.ts
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { mediaAssets } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { requireApiAuth } from '@/lib/auth/api-guard';
import { deleteStored } from '@/lib/media/storage';

export const runtime = 'nodejs';

const patchSchema = z.object({ altText: z.string().trim().max(255) });

/** Alt text is edited in place from the library grid. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAuth(request, ['admin', 'editor', 'author']);
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;
    const { altText } = patchSchema.parse(await request.json());

    await db
      .update(mediaAssets)
      .set({ altText: altText || null })
      .where(eq(mediaAssets.id, id));

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: { message: 'قيمة غير صالحة' } }, { status: 400 });
    }
    console.error('Media update error:', error);
    return NextResponse.json({ success: false, error: { message: 'تعذّر التحديث' } }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAuth(request, ['admin', 'editor']);
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;

    const rows = await db.select().from(mediaAssets).where(eq(mediaAssets.id, id)).limit(1);
    const asset = rows[0];
    if (!asset) {
      return NextResponse.json({ success: false, error: { message: 'غير موجود' } }, { status: 404 });
    }

    // Remove the files first: a failed row delete leaves orphaned bytes, but a
    // failed file delete would leave a row pointing at nothing.
    await deleteStored(asset.url);
    await deleteStored(asset.thumbnailUrl);
    await db.delete(mediaAssets).where(eq(mediaAssets.id, id));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Media delete error:', error);
    return NextResponse.json({ success: false, error: { message: 'تعذّر الحذف' } }, { status: 500 });
  }
}
