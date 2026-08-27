// app/api/commerce/coupons/[id]/route.ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { coupons } from '@/lib/db/schema';
import { and, eq, ne } from 'drizzle-orm';
import { requireApiAuth } from '@/lib/auth/api-guard';
import { couponSchema } from '@/lib/commerce-schema';

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAuth(request, ['admin', 'editor']);
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;
    const data = couponSchema.parse(await request.json());

    const clash = await db
      .select({ id: coupons.id })
      .from(coupons)
      .where(and(eq(coupons.code, data.code), ne(coupons.id, id)))
      .limit(1);

    if (clash[0]) {
      return NextResponse.json(
        { success: false, error: { message: 'هذا الكود مستخدم بالفعل' } },
        { status: 409 }
      );
    }

    // usedCount is deliberately not settable here: it is a redemption tally the
    // checkout transaction owns, not a field an editor should be able to reset.
    await db
      .update(coupons)
      .set({
        code: data.code,
        type: data.type,
        value: data.value,
        minSubtotal: data.minSubtotal,
        usageLimit: data.usageLimit,
        startsAt: data.startsAt ? new Date(data.startsAt) : null,
        endsAt: data.endsAt ? new Date(data.endsAt) : null,
        isActive: data.isActive,
      })
      .where(eq(coupons.id, id));

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: { message: 'Validation failed', issues: error.issues } },
        { status: 400 }
      );
    }
    console.error('Coupon update error:', error);
    return NextResponse.json({ success: false, error: { message: 'Internal server error' } }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAuth(request, ['admin', 'editor']);
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;

    // orders.couponCode is a snapshot string, not a foreign key, so deleting a
    // coupon cannot orphan an order — but a redeemed coupon is a record of what
    // was promised, so it is kept and only deactivated.
    const rows = await db.select({ usedCount: coupons.usedCount }).from(coupons).where(eq(coupons.id, id)).limit(1);
    const row = rows[0];
    if (!row) {
      return NextResponse.json({ success: false, error: { message: 'غير موجود' } }, { status: 404 });
    }

    if ((row.usedCount ?? 0) > 0) {
      await db.update(coupons).set({ isActive: false }).where(eq(coupons.id, id));
      return NextResponse.json(
        {
          success: false,
          error: { message: 'الكود مُستخدم في طلبات سابقة، فتم تعطيله بدل حذفه.' },
        },
        { status: 409 }
      );
    }

    await db.delete(coupons).where(eq(coupons.id, id));
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Coupon delete error:', error);
    return NextResponse.json({ success: false, error: { message: 'تعذّر الحذف' } }, { status: 500 });
  }
}
