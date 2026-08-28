// app/api/commerce/orders/[id]/route.ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiAuth } from '@/lib/auth/api-guard';
import { transitionOrder, setPaymentStatus, getOrderDetail } from '@/lib/commerce/orders';
import {
  ORDER_STATUSES,
  PAYMENT_STATUSES,
  STATUS_LABEL,
  notifiesCustomer,
} from '@/lib/commerce/order-status';
import { notifyOrderStatusChanged } from '@/lib/email/notify';

export const runtime = 'nodejs';

/**
 * There is deliberately no DELETE. Orders are financial records; `cancelled` is
 * how one stops being real, and it keeps the audit trail intact.
 */
const patchSchema = z.union([
  z.object({
    action: z.literal('status'),
    status: z.enum(ORDER_STATUSES),
    note: z.string().trim().max(1000).optional(),
  }),
  z.object({
    action: z.literal('payment'),
    paymentStatus: z.enum(PAYMENT_STATUSES),
  }),
]);

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAuth(request, ['admin', 'editor']);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const detail = await getOrderDetail(id);

  if (!detail) {
    return NextResponse.json({ success: false, error: { message: 'الطلب غير موجود' } }, { status: 404 });
  }

  return NextResponse.json({ success: true, data: detail });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAuth(request, ['admin', 'editor']);
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;
    const body = patchSchema.parse(await request.json());

    if (body.action === 'payment') {
      const done = await setPaymentStatus(id, body.paymentStatus);
      if (!done) {
        return NextResponse.json(
          { success: false, error: { message: 'الطلب غير موجود' } },
          { status: 404 }
        );
      }
      return NextResponse.json({ success: true });
    }

    const result = await transitionOrder({
      orderId: id,
      to: body.status,
      note: body.note,
      changedBy: auth.user.sub,
    });

    if (!result.ok) {
      if (result.code === 'NOT_FOUND') {
        return NextResponse.json(
          { success: false, error: { message: 'الطلب غير موجود' } },
          { status: 404 }
        );
      }

      // The UI only offers legal moves, so reaching here means either a direct
      // API call or a stale page. Both deserve the real reason.
      const current = result.from ? STATUS_LABEL[result.from].ar : '';
      const message =
        result.code === 'RACED'
          ? 'تم تعديل حالة الطلب من مكان آخر. أعد تحميل الصفحة.'
          : `لا يمكن الانتقال من «${current}» إلى «${STATUS_LABEL[body.status].ar}».`;

      return NextResponse.json({ success: false, error: { message } }, { status: 409 });
    }

    // After the transaction, never inside it, and never able to fail this
    // request — an admin moving twenty orders must not see a 500 because a
    // mail server was briefly down.
    if (notifiesCustomer(result.to)) {
      await notifyOrderStatusChanged({ orderId: id, status: result.to, note: body.note });
    }

    return NextResponse.json({
      success: true,
      data: { from: result.from, to: result.to, stockRestored: result.stockRestored },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: { message: 'قيمة غير صالحة', issues: error.issues } },
        { status: 400 }
      );
    }
    console.error('Order update error:', error);
    return NextResponse.json(
      { success: false, error: { message: 'تعذّر تحديث الطلب' } },
      { status: 500 }
    );
  }
}
