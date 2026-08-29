// app/api/commerce/bundles/route.ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { productBundles, bundleItems } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { requireApiAuth } from '@/lib/auth/api-guard';
import { bundleSchema } from '@/lib/commerce/bundle-schema';

export const runtime = 'nodejs';


export async function POST(request: Request) {
  const auth = await requireApiAuth(request, ['admin', 'editor']);
  if (!auth.ok) return auth.response;

  try {
    const data = bundleSchema.parse(await request.json());

    const clash = await db
      .select({ id: productBundles.id })
      .from(productBundles)
      .where(eq(productBundles.slug, data.slug))
      .limit(1);

    if (clash[0]) {
      return NextResponse.json(
        { success: false, error: { message: 'هذا الرابط مستخدم بالفعل' } },
        { status: 409 }
      );
    }

    const bundle = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(productBundles)
        .values({
          slug: data.slug,
          name: data.name,
          description: data.description || null,
          price: data.price,
          image: data.image || null,
          isActive: data.isActive,
          sortOrder: data.sortOrder,
        })
        .returning();

      await tx
        .insert(bundleItems)
        .values(data.items.map((i) => ({ bundleId: row!.id, variantId: i.variantId, qty: i.qty })));

      return row!;
    });

    return NextResponse.json({ success: true, data: bundle });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: { message: error.issues[0]?.message ?? 'بيانات غير صالحة' } },
        { status: 400 }
      );
    }
    console.error('Bundle create error:', error);
    return NextResponse.json({ success: false, error: { message: 'تعذّر الإنشاء' } }, { status: 500 });
  }
}
