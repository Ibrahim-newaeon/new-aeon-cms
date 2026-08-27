// app/api/categories/[id]/route.ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { categories, categoryI18n } from '@/lib/db/schema';
import { and, eq, ne } from 'drizzle-orm';
import { requireApiAuth } from '@/lib/auth/api-guard';
import { categorySchema } from '@/lib/taxonomy-schema';

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAuth(request, ['admin', 'editor']);
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;
    const data = categorySchema.parse(await request.json());

    // A category cannot parent itself — that makes the tree cyclic and any
    // recursive walk of it hangs.
    if (data.parentId === id) {
      return NextResponse.json(
        { success: false, error: { message: 'لا يمكن أن يكون التصنيف أباً لنفسه' } },
        { status: 400 }
      );
    }

    const clash = await db
      .select({ id: categories.id })
      .from(categories)
      .where(and(eq(categories.slug, data.slug), ne(categories.id, id)))
      .limit(1);

    if (clash[0]) {
      return NextResponse.json(
        { success: false, error: { message: 'هذا الرابط مستخدم بالفعل' } },
        { status: 409 }
      );
    }

    await db
      .update(categories)
      .set({
        slug: data.slug,
        parentId: data.parentId ?? null,
        icon: data.icon || null,
        sortOrder: data.sortOrder,
        isActive: data.isActive,
      })
      .where(eq(categories.id, id));

    for (const t of data.translations) {
      const found = await db
        .select({ id: categoryI18n.id })
        .from(categoryI18n)
        .where(and(eq(categoryI18n.categoryId, id), eq(categoryI18n.locale, t.locale)))
        .limit(1);

      const values = { name: t.name, description: t.description || null };
      const existing = found[0];

      if (existing) {
        await db.update(categoryI18n).set(values).where(eq(categoryI18n.id, existing.id));
      } else {
        await db.insert(categoryI18n).values({ categoryId: id, locale: t.locale, ...values });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: { message: 'Validation failed', issues: error.issues } },
        { status: 400 }
      );
    }
    console.error('Category update error:', error);
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

    // categories.parentId carries no ON DELETE rule, so removing a parent would
    // leave children pointing at a row that no longer exists. Refuse instead of
    // silently orphaning them.
    const children = await db
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.parentId, id))
      .limit(1);

    if (children[0]) {
      return NextResponse.json(
        { success: false, error: { message: 'لا يمكن الحذف: يوجد تصنيفات فرعية' } },
        { status: 409 }
      );
    }

    await db.delete(categoryI18n).where(eq(categoryI18n.categoryId, id));
    await db.delete(categories).where(eq(categories.id, id));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Category delete error:', error);
    return NextResponse.json(
      { success: false, error: { message: 'تعذّر الحذف' } },
      { status: 500 }
    );
  }
}
