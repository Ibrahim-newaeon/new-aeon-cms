// app/api/commerce/brands/[id]/route.ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { brands, products } from '@/lib/db/schema';
import { and, eq, ne } from 'drizzle-orm';
import { requireApiAuth } from '@/lib/auth/api-guard';
import { brandSchema } from '@/lib/commerce-schema';

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAuth(request, ['admin', 'editor']);
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;
    const data = brandSchema.parse(await request.json());

    const clash = await db
      .select({ id: brands.id })
      .from(brands)
      .where(and(eq(brands.slug, data.slug), ne(brands.id, id)))
      .limit(1);

    if (clash[0]) {
      return NextResponse.json(
        { success: false, error: { message: 'هذا الرابط مستخدم بالفعل' } },
        { status: 409 }
      );
    }

    await db
      .update(brands)
      .set({
        slug: data.slug,
        name: data.name,
        logoUrl: data.logoUrl || null,
        isActive: data.isActive,
        sortOrder: data.sortOrder,
      })
      .where(eq(brands.id, id));

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: { message: 'Validation failed', issues: error.issues } },
        { status: 400 }
      );
    }
    console.error('Brand update error:', error);
    return NextResponse.json({ success: false, error: { message: 'Internal server error' } }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAuth(request, ['admin', 'editor']);
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;

    // products.brandId carries no ON DELETE rule, so deleting a brand in use
    // would leave products pointing at a missing row.
    const inUse = await db.select({ id: products.id }).from(products).where(eq(products.brandId, id)).limit(1);
    if (inUse[0]) {
      return NextResponse.json(
        { success: false, error: { message: 'لا يمكن الحذف: توجد منتجات مرتبطة بهذه العلامة' } },
        { status: 409 }
      );
    }

    await db.delete(brands).where(eq(brands.id, id));
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Brand delete error:', error);
    return NextResponse.json({ success: false, error: { message: 'تعذّر الحذف' } }, { status: 500 });
  }
}
