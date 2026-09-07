// app/api/themes/convert-php/route.ts
import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { auditLog } from '@/lib/db/schema';
import { requireApiAuth } from '@/lib/auth/api-guard';
import { convertPhpThemeZip } from '@/lib/themes/php-convert';
import { installConvertedTheme } from '@/lib/themes/install-pack';
import { ThemeZipError } from '@/lib/themes/zip';
import { MAX_THEME_ZIP_BYTES } from '@/lib/themes/limits';

/**
 * Upload a PHP theme zip → convert to HTML pack → store (inactive).
 * PHP is never executed.
 */
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
    let converted;
    try {
      converted = await convertPhpThemeZip(buf);
    } catch (e) {
      if (e instanceof ThemeZipError) {
        return NextResponse.json(
          { success: false, error: { message: e.message } },
          { status: 400 }
        );
      }
      throw e;
    }

    const theme = await installConvertedTheme({
      manifest: converted.manifest,
      files: converted.files,
    });

    await db.insert(auditLog).values({
      userId: auth.user.sub,
      action: 'themes.convert_php',
      entityType: 'theme',
      entityId: theme.id,
      payload: { warnings: converted.warnings.slice(0, 50) },
      ipAddress: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
      userAgent: request.headers.get('user-agent') ?? null,
    });

    revalidatePath('/', 'layout');
    return NextResponse.json({
      success: true,
      theme,
      warnings: converted.warnings,
    });
  } catch (error) {
    console.error('php theme convert', error);
    return NextResponse.json(
      { success: false, error: { message: 'Conversion failed' } },
      { status: 500 }
    );
  }
}
