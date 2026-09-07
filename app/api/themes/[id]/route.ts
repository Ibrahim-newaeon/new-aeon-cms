// app/api/themes/[id]/route.ts
import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { auditLog } from '@/lib/db/schema';
import { requireApiAuth } from '@/lib/auth/api-guard';
import {
  activateTheme,
  deleteThemeRecord,
  getThemeById,
} from '@/lib/themes/active';
import { removeThemeDir } from '@/lib/themes/store';

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireApiAuth(request, ['admin']);
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  const url = new URL(request.url);
  const action = url.searchParams.get('action') ?? 'activate';

  const row = await getThemeById(id);
  if (!row) {
    return NextResponse.json(
      { success: false, error: { message: 'Theme not found' } },
      { status: 404 }
    );
  }

  if (action === 'activate') {
    await activateTheme(id);
    await db.insert(auditLog).values({
      userId: auth.user.sub,
      action: 'themes.activate',
      entityType: 'theme',
      entityId: id,
    });
    revalidatePath('/', 'layout');
    return NextResponse.json({ success: true });
  }

  return NextResponse.json(
    { success: false, error: { message: 'Unknown action' } },
    { status: 400 }
  );
}

export async function DELETE(request: Request, ctx: Ctx) {
  const auth = await requireApiAuth(request, ['admin']);
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  const row = await deleteThemeRecord(id);
  if (!row) {
    return NextResponse.json(
      { success: false, error: { message: 'Theme not found' } },
      { status: 404 }
    );
  }
  await removeThemeDir(id).catch(() => undefined);
  await db.insert(auditLog).values({
    userId: auth.user.sub,
    action: 'themes.delete',
    entityType: 'theme',
    entityId: id,
  });
  revalidatePath('/', 'layout');
  return NextResponse.json({ success: true });
}
