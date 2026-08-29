// app/api/commerce/bundles/[id]/route.ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { productBundles, bundleItems } from '@/lib/db/schema';
import { and, eq, ne } from 'drizzle-orm';
import { requireApiAuth } from '@/lib/auth/api-guard';
import { bundleSchema } from '@/lib/commerce/bundle-schema';

export const runtime = 'nodejs';

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAuth(request, ['admin', 'editor']);
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;
    const data = bundleSchema.parse(await request.json());

    const clash = await db
      .select({ id: productBundles.id })
      .from(productBundles)
      .where(and(eq(productBundles.slug, data.slug), ne(productBundles.id, id)))
      .limit(1);

    if (clash[0]) {
      return NextResponse.json(
        { success: false, error: { message: 'هذا الرابط مستخدم بالفعل' } },
        { status: 409 }
      );
    }

    await db.transaction(async (tx) => {
      await tx
        .update(productBundles)
        .set({
          slug: data.slug,
          name: data.name,
          description: data.description || null,
          price: data.price,
          image: data.image || null,
          isActive: data.isActive,
          sortOrder: data.sortOrder,
        })
        .where(eq(productBundles.id, id));

      // Replace rather than diff: the item set is small and has no columns
      // worth preserving, exactly like the content taxonomy join tables.
      await tx.delete(bundleItems).where(eq(bundleItems.bundleId, id));
      await tx
        .insert(bundleItems)
        .values(data.items.map((i) => ({ bundleId: id, variantId: i.variantId, qty: i.qty })));
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: { message: error.issues[0]?.message ?? 'بيانات غير صالحة' } },
        { status: 400 }
      );
    }
    console.error('Bundle update error:', error);
    return NextResponse.json({ success: false, error: { message: 'تعذّر التحديث' } }, { status: 500 });
  }
}

/**
 * Deleting a bundle removes only the grouping.
 *
 * bundle_items cascades, but nothing touches product_variants — the components
 * are ordinary products that exist independently, and a bundle is just a way of
 * selling them together.
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAuth(request, ['admin', 'editor']);
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;
    await db.delete(productBundles).where(eq(productBundles.id, id));
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Bundle delete error:', error);
    return NextResponse.json({ success: false, error: { message: 'تعذّر الحذف' } }, { status: 500 });
  }
}
