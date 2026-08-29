// app/api/media/folders/[id]/route.ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiAuth } from '@/lib/auth/api-guard';
import { renameFolder, deleteFolder } from '@/lib/media/folders';

export const runtime = 'nodejs';

const patchSchema = z.object({ name: z.string().trim().min(1).max(255) });

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAuth(request, ['admin', 'editor']);
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;
    const { name } = patchSchema.parse(await request.json());

    if (!(await renameFolder(id, name))) {
      return NextResponse.json({ success: false, error: { message: 'غير موجود' } }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: { message: 'قيمة غير صالحة' } }, { status: 400 });
    }
    console.error('Media folder rename error:', error);
    return NextResponse.json({ success: false, error: { message: 'تعذّر التحديث' } }, { status: 500 });
  }
}

/**
 * Deletes the folder, keeping everything inside it.
 *
 * Assets move to the root and child folders are promoted. A folder is an
 * organising device; deleting one must never be a way to lose files.
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAuth(request, ['admin', 'editor']);
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;
    const { movedAssets } = await deleteFolder(id);
    return NextResponse.json({ success: true, data: { movedAssets } });
  } catch (error) {
    console.error('Media folder delete error:', error);
    return NextResponse.json({ success: false, error: { message: 'تعذّر الحذف' } }, { status: 500 });
  }
}
