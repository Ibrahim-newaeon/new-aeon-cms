// app/api/commerce/shipping-zones/[id]/route.ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { shippingZones, orders } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { requireApiAuth } from '@/lib/auth/api-guard';
import { shippingZoneSchema } from '@/lib/commerce-schema';
import { findOverlappingGovernorates, labelGovernorates } from '@/lib/commerce/zone-overlap';

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAuth(request, ['admin', 'editor']);
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;
    const data = shippingZoneSchema.parse(await request.json());

    if (data.isActive) {
      const clash = await findOverlappingGovernorates(data.governorates, id);
      if (clash.length > 0) {
        return NextResponse.json(
          {
            success: false,
            error: { message: `محافظات مغطّاة بمنطقة أخرى: ${labelGovernorates(clash)}` },
          },
          { status: 409 }
        );
      }
    }

    await db
      .update(shippingZones)
      .set({
        name: data.name,
        governorates: data.governorates,
        flatRate: data.flatRate,
        freeOver: data.freeOver,
        etaDays: data.etaDays,
        isActive: data.isActive,
        sortOrder: data.sortOrder,
      })
      .where(eq(shippingZones.id, id));

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: { message: 'Validation failed', issues: error.issues } },
        { status: 400 }
      );
    }
    console.error('Shipping zone update error:', error);
    return NextResponse.json({ success: false, error: { message: 'Internal server error' } }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAuth(request, ['admin', 'editor']);
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;

    // orders.shippingZoneId has no ON DELETE rule, and past orders must keep
    // pointing at the zone they were charged under. Disable, don't delete.
    const inUse = await db
      .select({ id: orders.id })
      .from(orders)
      .where(eq(orders.shippingZoneId, id))
      .limit(1);

    if (inUse[0]) {
      return NextResponse.json(
        {
          success: false,
          error: { message: 'لا يمكن الحذف: توجد طلبات شُحنت بهذه المنطقة. عطّلها بدل حذفها.' },
        },
        { status: 409 }
      );
    }

    await db.delete(shippingZones).where(eq(shippingZones.id, id));
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Shipping zone delete error:', error);
    return NextResponse.json({ success: false, error: { message: 'تعذّر الحذف' } }, { status: 500 });
  }
}
