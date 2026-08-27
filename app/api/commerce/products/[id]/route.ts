// app/api/commerce/products/[id]/route.ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { products, productI18n } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { requireApiAuth } from '@/lib/auth/api-guard';
import { productSchema } from '@/lib/commerce-schema';
import { writeProductStructure, slugTaken } from '@/lib/commerce/products';

const WRITERS = ['admin', 'editor'] as const;

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAuth(request, WRITERS);
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;
    const data = productSchema.parse(await request.json());

    const existing = await db.select({ id: products.id }).from(products).where(eq(products.id, id)).limit(1);
    if (!existing[0]) {
      return NextResponse.json({ success: false, error: { message: 'غير موجود' } }, { status: 404 });
    }

    if (await slugTaken(data.slug, id)) {
      return NextResponse.json(
        { success: false, error: { message: 'هذا الرابط مستخدم بالفعل' } },
        { status: 409 }
      );
    }

    await db
      .update(products)
      .set({
        slug: data.slug,
        brandId: data.brandId ?? null,
        categoryId: data.categoryId ?? null,
        basePrice: data.basePrice,
        compareAtPrice: data.compareAtPrice ?? null,
        isActive: data.isActive,
        sortOrder: data.sortOrder,
        updatedAt: new Date(),
      })
      .where(eq(products.id, id));

    for (const t of data.translations) {
      const found = await db
        .select({ id: productI18n.id })
        .from(productI18n)
        .where(and(eq(productI18n.productId, id), eq(productI18n.locale, t.locale)))
        .limit(1);

      const values = {
        name: t.name,
        shortDesc: t.shortDesc || null,
        description: t.description || null,
        metaTitle: t.metaTitle || null,
        metaDescription: t.metaDescription || null,
      };

      const row = found[0];
      if (row) {
        await db.update(productI18n).set(values).where(eq(productI18n.id, row.id));
      } else {
        await db.insert(productI18n).values({ productId: id, locale: t.locale, ...values });
      }
    }

    await writeProductStructure(id, data);

    return NextResponse.json({ success: true, data: { id } });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: { message: 'Validation failed', issues: error.issues } },
        { status: 400 }
      );
    }
    console.error('Product update error:', error);
    return NextResponse.json(
      { success: false, error: { message: 'Internal server error' } },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAuth(request, WRITERS);
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;

    // productI18n, images, specs, variants and options all cascade from
    // products, so this one delete is enough. When orders exist (C2) this must
    // become a soft delete — an order line referencing a deleted product would
    // otherwise lose its history.
    await db.delete(products).where(eq(products.id, id));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Product delete error:', error);
    return NextResponse.json(
      { success: false, error: { message: 'تعذّر الحذف' } },
      { status: 500 }
    );
  }
}
