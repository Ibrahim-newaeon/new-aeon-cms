// app/api/tags/[id]/route.ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { tags, contentTags } from '@/lib/db/schema';
import { and, eq, ne } from 'drizzle-orm';
import { requireApiAuth } from '@/lib/auth/api-guard';
import { tagSchema } from '@/lib/taxonomy-schema';
import { setTagTranslations } from '@/lib/content/tag-i18n';

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAuth(request, ['admin', 'editor', 'author']);
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;
    const data = tagSchema.parse(await request.json());

    const clash = await db
      .select({ id: tags.id })
      .from(tags)
      .where(and(eq(tags.slug, data.slug), ne(tags.id, id)))
      .limit(1);

    if (clash[0]) {
      return NextResponse.json(
        { success: false, error: { message: 'هذا الرابط مستخدم بالفعل' } },
        { status: 409 }
      );
    }

    const { translations, ...tagRow } = data;

    await db.update(tags).set(tagRow).where(eq(tags.id, id));
    await setTagTranslations(id, translations);

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: { message: 'Validation failed', issues: error.issues } },
        { status: 400 }
      );
    }
    console.error('Tag update error:', error);
    return NextResponse.json(
      { success: false, error: { message: 'Internal server error' } },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAuth(request, ['admin', 'editor']);
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;

    // contentTags cascades on tagId, so the join rows go with it. Deleting a
    // tag detaches it from content rather than deleting that content.
    // tag_i18n has ON DELETE CASCADE, so its rows go automatically.
    await db.delete(contentTags).where(eq(contentTags.tagId, id));
    await db.delete(tags).where(eq(tags.id, id));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Tag delete error:', error);
    return NextResponse.json(
      { success: false, error: { message: 'تعذّر الحذف' } },
      { status: 500 }
    );
  }
}
