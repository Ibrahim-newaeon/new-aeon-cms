// app/api/themes/route.ts
import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { themes, auditLog } from '@/lib/db/schema';
import { requireApiAuth } from '@/lib/auth/api-guard';
import { extractThemeZip, ThemeZipError } from '@/lib/themes/zip';
import { listThemes } from '@/lib/themes/active';
import { MAX_THEME_ZIP_BYTES } from '@/lib/themes/limits';
import { removeThemeDir } from '@/lib/themes/store';

export async function GET(request: Request) {
  const auth = await requireApiAuth(request, ['admin']);
  if (!auth.ok) return auth.response;
  const rows = await listThemes();
  return NextResponse.json({
    success: true,
    themes: rows.map((t) => ({
      id: t.id,
      name: t.name,
      version: t.version,
      isActive: t.isActive,
      createdAt: t.createdAt,
    })),
  });
}

export async function POST(request: Request) {
  const auth = await requireApiAuth(request, ['admin']);
  if (!auth.ok) return auth.response;

  try {
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json(
        { success: false, error: { message: 'file is required' } },
        { status: 400 }
      );
    }
    if (file.size > MAX_THEME_ZIP_BYTES) {
      return NextResponse.json(
        { success: false, error: { message: 'Zip too large' } },
        { status: 400 }
      );
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const id = randomUUID();

    let manifest;
    try {
      manifest = await extractThemeZip(id, buf);
    } catch (e) {
      await removeThemeDir(id).catch(() => undefined);
      if (e instanceof ThemeZipError) {
        return NextResponse.json(
          { success: false, error: { message: e.message } },
          { status: 400 }
        );
      }
      throw e;
    }

    const [row] = await db
      .insert(themes)
      .values({
        id,
        name: manifest.name,
        version: manifest.version,
        manifest,
        isActive: false,
      })
      .returning();

    await db.insert(auditLog).values({
      userId: auth.user.sub,
      action: 'themes.upload',
      entityType: 'theme',
      entityId: id,
      ipAddress: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
      userAgent: request.headers.get('user-agent') ?? null,
    });

    revalidatePath('/', 'layout');
    return NextResponse.json({ success: true, theme: row });
  } catch (error) {
    console.error('theme upload', error);
    return NextResponse.json(
      { success: false, error: { message: 'Upload failed' } },
      { status: 500 }
    );
  }
}
