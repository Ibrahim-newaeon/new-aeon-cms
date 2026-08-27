// app/api/categories/route.ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { categories, categoryI18n } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { requireApiAuth } from '@/lib/auth/api-guard';
import { categorySchema } from '@/lib/taxonomy-schema';

export async function POST(request: Request) {
  const auth = await requireApiAuth(request, ['admin', 'editor']);
  if (!auth.ok) return auth.response;

  try {
    const data = categorySchema.parse(await request.json());

    // categories_slug_idx is UNIQUE. Checking first turns a 500 from a
    // constraint violation into a field-level message the author can act on.
    const clash = await db
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.slug, data.slug))
      .limit(1);

    if (clash[0]) {
      return NextResponse.json(
        { success: false, error: { message: 'هذا الرابط مستخدم بالفعل' } },
        { status: 409 }
      );
    }

    const [row] = await db
      .insert(categories)
      .values({
        slug: data.slug,
        parentId: data.parentId ?? null,
        icon: data.icon || null,
        sortOrder: data.sortOrder,
        isActive: data.isActive,
      })
      .returning();

    if (!row) throw new Error('insert returned no row');

    await db.insert(categoryI18n).values(
      data.translations.map((t) => ({
        categoryId: row.id,
        locale: t.locale,
        name: t.name,
        description: t.description || null,
      }))
    );

    return NextResponse.json({ success: true, data: { id: row.id } });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: { message: 'Validation failed', issues: error.issues } },
        { status: 400 }
      );
    }
    console.error('Category create error:', error);
    return NextResponse.json(
      { success: false, error: { message: 'Internal server error' } },
      { status: 500 }
    );
  }
}
