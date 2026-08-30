// app/api/commerce/products/route.ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { setProductCategories } from '@/lib/commerce/product-categories';
import { products, productI18n } from '@/lib/db/schema';
import { requireApiAuth } from '@/lib/auth/api-guard';
import { productSchema } from '@/lib/commerce-schema';
import { writeProductStructure, slugTaken } from '@/lib/commerce/products';

// A catalogue is not authored content, so `author` is excluded here even though
// it can write pages and posts.
const WRITERS = ['admin', 'editor'] as const;

export async function POST(request: Request) {
  const auth = await requireApiAuth(request, WRITERS);
  if (!auth.ok) return auth.response;

  try {
    const data = productSchema.parse(await request.json());

    if (await slugTaken(data.slug)) {
      return NextResponse.json(
        { success: false, error: { message: 'هذا الرابط مستخدم بالفعل' } },
        { status: 409 }
      );
    }

    const [row] = await db
      .insert(products)
      .values({
        slug: data.slug,
        brandId: data.brandId ?? null,
        basePrice: data.basePrice,
        compareAtPrice: data.compareAtPrice ?? null,
        isActive: data.isActive,
        sortOrder: data.sortOrder,
      })
      .returning({ id: products.id });

    if (!row) throw new Error('insert returned no row');

    // Ordered: the first is the primary category.
    await setProductCategories(row.id, data.categoryIds);

    await db.insert(productI18n).values(
      data.translations.map((t) => ({
        productId: row.id,
        locale: t.locale,
        name: t.name,
        shortDesc: t.shortDesc || null,
        description: t.description || null,
        metaTitle: t.metaTitle || null,
        metaDescription: t.metaDescription || null,
      }))
    );

    await writeProductStructure(row.id, data);

    return NextResponse.json({ success: true, data: { id: row.id } });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: { message: 'Validation failed', issues: error.issues } },
        { status: 400 }
      );
    }
    console.error('Product create error:', error);
    return NextResponse.json(
      { success: false, error: { message: 'Internal server error' } },
      { status: 500 }
    );
  }
}
