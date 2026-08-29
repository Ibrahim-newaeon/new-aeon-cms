// app/api/tags/route.ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { tags } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { requireApiAuth } from '@/lib/auth/api-guard';
import { tagSchema } from '@/lib/taxonomy-schema';
import { setTagTranslations } from '@/lib/content/tag-i18n';

/**
 * Tags carry per-locale names in tag_i18n, with `tags.name` as the fallback.
 * Before that table existed a tag read in one language on both locales of a
 * bilingual site.
 */
export async function POST(request: Request) {
  const auth = await requireApiAuth(request, ['admin', 'editor', 'author']);
  if (!auth.ok) return auth.response;

  try {
    const data = tagSchema.parse(await request.json());

    const clash = await db
      .select({ id: tags.id })
      .from(tags)
      .where(eq(tags.slug, data.slug))
      .limit(1);

    if (clash[0]) {
      return NextResponse.json(
        { success: false, error: { message: 'هذا الرابط مستخدم بالفعل' } },
        { status: 409 }
      );
    }

    // `translations` is not a column on `tags`; destructured out so the insert
    // does not receive it.
    const { translations, ...tagRow } = data;

    const [row] = await db.insert(tags).values(tagRow).returning();
    if (row) await setTagTranslations(row.id, translations);

    return NextResponse.json({ success: true, data: row });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: { message: 'Validation failed', issues: error.issues } },
        { status: 400 }
      );
    }
    console.error('Tag create error:', error);
    return NextResponse.json(
      { success: false, error: { message: 'Internal server error' } },
      { status: 500 }
    );
  }
}
