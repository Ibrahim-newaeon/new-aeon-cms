// app/api/commerce/coupons/route.ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { coupons } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { requireApiAuth } from '@/lib/auth/api-guard';
import { couponSchema } from '@/lib/commerce-schema';

export async function POST(request: Request) {
  const auth = await requireApiAuth(request, ['admin', 'editor']);
  if (!auth.ok) return auth.response;

  try {
    const data = couponSchema.parse(await request.json());

    const clash = await db.select({ id: coupons.id }).from(coupons).where(eq(coupons.code, data.code)).limit(1);
    if (clash[0]) {
      return NextResponse.json(
        { success: false, error: { message: 'هذا الكود مستخدم بالفعل' } },
        { status: 409 }
      );
    }

    const [row] = await db
      .insert(coupons)
      .values({
        code: data.code,
        type: data.type,
        value: data.value,
        minSubtotal: data.minSubtotal,
        usageLimit: data.usageLimit,
        startsAt: data.startsAt ? new Date(data.startsAt) : null,
        endsAt: data.endsAt ? new Date(data.endsAt) : null,
        isActive: data.isActive,
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
    console.error('Coupon create error:', error);
    return NextResponse.json({ success: false, error: { message: 'Internal server error' } }, { status: 500 });
  }
}
