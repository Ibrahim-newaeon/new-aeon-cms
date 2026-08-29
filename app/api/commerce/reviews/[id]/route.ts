// app/api/commerce/reviews/[id]/route.ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { productReviews } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { requireApiAuth } from '@/lib/auth/api-guard';
import { moderateReview } from '@/lib/commerce/reviews';

export const runtime = 'nodejs';

const schema = z.object({ status: z.enum(['approved', 'rejected']) });

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAuth(request, ['admin', 'editor']);
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;
    const { status } = schema.parse(await request.json());

    if (!(await moderateReview(id, status, auth.user.sub))) {
      return NextResponse.json({ success: false, error: { message: 'غير موجود' } }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: { message: 'قيمة غير صالحة' } }, { status: 400 });
    }
    console.error('Review moderation error:', error);
    return NextResponse.json({ success: false, error: { message: 'تعذّر التحديث' } }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAuth(request, ['admin']);
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;
    await db.delete(productReviews).where(eq(productReviews.id, id));
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Review delete error:', error);
    return NextResponse.json({ success: false, error: { message: 'تعذّر الحذف' } }, { status: 500 });
  }
}
