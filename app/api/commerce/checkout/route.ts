// app/api/commerce/checkout/route.ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { readCartCookie, clearCart } from '@/lib/commerce/cart';
import { placeOrder } from '@/lib/commerce/checkout';
import { verifyCheckoutToken } from '@/lib/commerce/checkout-token';
import { commerceEnabled } from '@/lib/commerce/guard';
import { isValidJordanianMobile, isGovernorate } from '@/lib/commerce/phone';
import { rateLimit, clientKey } from '@/lib/rate-limit';
import { notifyOrderPlaced } from '@/lib/email/notify';

export const runtime = 'nodejs';

/**
 * The body carries NO prices. Only what the customer actually chose and typed.
 * Any `total`, `subtotal` or `price` field sent by a client is ignored, because
 * this schema does not accept one and the total is computed from the database.
 */
const checkoutSchema = z.object({
  name: z.string().trim().min(2, 'الاسم مطلوب').max(255),
  phone: z.string().trim().refine(isValidJordanianMobile, 'رقم هاتف أردني غير صالح'),
  email: z.union([z.literal(''), z.string().email('بريد غير صالح')]).optional(),
  governorate: z.string().refine(isGovernorate, 'اختر المحافظة'),
  city: z.string().trim().min(2, 'المدينة مطلوبة').max(100),
  addressLine: z.string().trim().min(5, 'العنوان مطلوب').max(500),
  landmark: z.string().trim().max(255).optional(),
  notes: z.string().trim().max(1000).optional(),
  couponCode: z.string().trim().max(50).optional(),
  locale: z.enum(['ar', 'en']).default('ar'),
  /**
   * One-time token, so a double-submitted form cannot create two orders.
   * A signed JWT, ~200 characters — not the UUID an earlier draft minted.
   */
  token: z.string().min(20).max(1024),
});

const FAILURE_MESSAGE: Record<string, string> = {
  EMPTY_CART: 'سلتك فارغة.',
  UNAVAILABLE: 'بعض المنتجات لم تعد متوفّرة بالكمية المطلوبة.',
  NO_SHIPPING_ZONE: 'لا نوصّل إلى هذه المحافظة حالياً. يرجى التواصل معنا.',
  COUPON_INVALID: 'كود الخصم غير صالح.',
};

const COUPON_REASON: Record<string, string> = {
  not_found: 'كود الخصم غير موجود أو معطّل.',
  not_started: 'كود الخصم لم يبدأ بعد.',
  expired: 'انتهت صلاحية كود الخصم.',
  limit_reached: 'تم استخدام كود الخصم بالكامل.',
  below_minimum: 'قيمة الطلب أقل من الحد الأدنى لهذا الكود.',
};

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return request.headers.get('sec-fetch-site') === 'same-origin';
  try {
    return new URL(origin).host === request.headers.get('host');
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ success: false }, { status: 403 });
  }
  if (!(await commerceEnabled())) {
    return NextResponse.json({ success: false }, { status: 404 });
  }

  // Order placement writes to the database and decrements stock; without a
  // limit it is a denial-of-inventory vector.
  const limit = await rateLimit(clientKey(request, 'checkout'), 10, 600);
  if (!limit.allowed) {
    return NextResponse.json(
      { success: false, error: { message: 'محاولات كثيرة. حاول لاحقاً.' } },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
    );
  }

  try {
    const data = checkoutSchema.parse(await request.json());

    // The token is signed by us; its jti becomes the idempotency key, and the
    // UNIQUE index on orders.idempotency_key makes a repeat submit return the
    // original order instead of creating a second one.
    const idempotencyKey = await verifyCheckoutToken(data.token);
    if (!idempotencyKey) {
      return NextResponse.json(
        { success: false, error: { message: 'انتهت صلاحية النموذج. أعد تحميل الصفحة.' } },
        { status: 409 }
      );
    }

    const cart = await readCartCookie();
    const result = await placeOrder(
      cart,
      {
        name: data.name,
        phone: data.phone,
        email: data.email,
        governorate: data.governorate,
        city: data.city,
        addressLine: data.addressLine,
        landmark: data.landmark,
        notes: data.notes,
      },
      data.couponCode,
      data.locale,
      idempotencyKey
    );

    if (!result.ok) {
      const f = result.failure;
      const message =
        f.code === 'COUPON_INVALID'
          ? COUPON_REASON[f.reason] ?? FAILURE_MESSAGE.COUPON_INVALID
          : FAILURE_MESSAGE[f.code] ?? 'تعذّر إتمام الطلب.';

      return NextResponse.json(
        {
          success: false,
          error: { code: f.code, message, ...(f.code === 'UNAVAILABLE' ? { items: f.items } : {}) },
        },
        { status: f.code === 'UNAVAILABLE' ? 409 : 400 }
      );
    }

    // Empty the cart only after the order exists.
    await clearCart();

    // Mail comes last, after the order is committed and outside its
    // transaction. `notifyOrderPlaced` never throws — a failed confirmation
    // must not turn a real order into a 500 the customer reads as "it did not
    // go through", especially since the idempotency key would swallow a retry.
    //
    // Skipped for a duplicate submit: the order already exists and was already
    // announced, and sending again would tell the customer they bought twice.
    if (!result.duplicate) {
      await notifyOrderPlaced(result.orderId, data.locale);
    }

    return NextResponse.json({
      success: true,
      data: { orderNumber: result.orderNumber, duplicate: result.duplicate ?? false },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: { message: error.issues[0]?.message ?? 'بيانات غير صالحة', issues: error.issues } },
        { status: 400 }
      );
    }
    console.error('Checkout error:', error);
    return NextResponse.json(
      { success: false, error: { message: 'تعذّر إتمام الطلب.' } },
      { status: 500 }
    );
  }
}
