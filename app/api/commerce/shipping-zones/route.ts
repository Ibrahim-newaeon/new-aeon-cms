// app/api/commerce/shipping-zones/route.ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { shippingZones } from '@/lib/db/schema';
import { requireApiAuth } from '@/lib/auth/api-guard';
import { shippingZoneSchema } from '@/lib/commerce-schema';
import { findOverlappingGovernorates, labelGovernorates } from '@/lib/commerce/zone-overlap';

export async function POST(request: Request) {
  const auth = await requireApiAuth(request, ['admin', 'editor']);
  if (!auth.ok) return auth.response;

  try {
    const data = shippingZoneSchema.parse(await request.json());

    if (data.isActive) {
      const clash = await findOverlappingGovernorates(data.governorates);
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

    const [row] = await db
      .insert(shippingZones)
      .values({
        name: data.name,
        governorates: data.governorates,
        flatRate: data.flatRate,
        freeOver: data.freeOver,
        etaDays: data.etaDays,
        isActive: data.isActive,
        sortOrder: data.sortOrder,
      })
      .returning();

    return NextResponse.json({ success: true, data: row });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: { message: 'Validation failed', issues: error.issues } },
        { status: 400 }
      );
    }
    console.error('Shipping zone create error:', error);
    return NextResponse.json({ success: false, error: { message: 'Internal server error' } }, { status: 500 });
  }
}
