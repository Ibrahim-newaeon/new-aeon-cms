// app/api/media/folders/route.ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiAuth } from '@/lib/auth/api-guard';
import { listFolders, createFolder, moveAssets } from '@/lib/media/folders';

export const runtime = 'nodejs';

const createSchema = z.object({
  name: z.string().trim().min(1).max(255),
  parentId: z.string().uuid().nullable().optional(),
});

const moveSchema = z.object({
  action: z.literal('move'),
  assetIds: z.array(z.string().uuid()).min(1).max(500),
  folderId: z.string().uuid().nullable(),
});

export async function GET(request: Request) {
  const auth = await requireApiAuth(request, ['admin', 'editor', 'author']);
  if (!auth.ok) return auth.response;

  return NextResponse.json({ success: true, data: await listFolders() });
}

export async function POST(request: Request) {
  const auth = await requireApiAuth(request, ['admin', 'editor']);
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();

    // Moving assets shares this route so the client has one folder endpoint.
    const move = moveSchema.safeParse(body);
    if (move.success) {
      const moved = await moveAssets(move.data.assetIds, move.data.folderId);
      return NextResponse.json({ success: true, data: { moved } });
    }

    const data = createSchema.parse(body);
    const result = await createFolder(data.name, data.parentId ?? null);

    if (!result.ok) {
      const message =
        result.reason === 'TOO_DEEP'
          ? 'يُسمح بمستوى واحد من التفريع فقط.'
          : 'المجلد الأب غير موجود.';
      return NextResponse.json({ success: false, error: { message } }, { status: 400 });
    }

    return NextResponse.json({ success: true, data: result.value });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: { message: 'قيمة غير صالحة' } }, { status: 400 });
    }
    console.error('Media folder create error:', error);
    return NextResponse.json({ success: false, error: { message: 'تعذّر الإنشاء' } }, { status: 500 });
  }
}
