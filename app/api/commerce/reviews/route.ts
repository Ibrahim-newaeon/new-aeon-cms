// app/api/commerce/reviews/route.ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { submitReview, MIN_RATING, MAX_RATING } from '@/lib/commerce/reviews';
import { commerceEnabled } from '@/lib/commerce/guard';
import { isValidJordanianMobile } from '@/lib/commerce/phone';
import { rateLimit, clientKey } from '@/lib/rate-limit';

export const runtime = 'nodejs';

const schema = z.object({
  productId: z.string().uuid(),
  name: z.string().trim().min(2).max(255),
  phone: z.string().trim().refine(isValidJordanianMobile, 'رقم هاتف أردني غير صالح'),
  rating: z.number().int().min(MIN_RATING).max(MAX_RATING),
  body: z.string().trim().min(10).max(2000),
});

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return request.headers.get('sec-fetch-site') === 'same-origin';
  try {
    return new URL(origin).host === request.headers.get('host');
  } catch {
    return false;
  }
}

/**
 * Public, so it carries the same guards as the other public writes: same-origin
 * only, rate limited, and everything it stores stays invisible until a human
 * approves it.
 */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ success: false }, { status: 403 });
  if (!(await commerceEnabled())) return NextResponse.json({ success: false }, { status: 404 });

  const limit = await rateLimit(clientKey(request, 'reviews'), 5, 3600);
  if (!limit.allowed) {
    return NextResponse.json(
      { success: false, error: { message: 'محاولات كثيرة. حاول لاحقاً.' } },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
    );
  }

  try {
    const data = schema.parse(await request.json());

    const result = await submitReview({
      productId: data.productId,
      customerName: data.name,
      phone: data.phone,
      rating: data.rating,
      body: data.body,
    });

    if (!result.ok) {
      const message =
        result.reason === 'ALREADY_REVIEWED'
          ? 'لقد قيّمت هذا المنتج من قبل.'
          : result.reason === 'PRODUCT_NOT_FOUND'
            ? 'المنتج غير موجود.'
            : 'التقييم يجب أن يكون بين ١ و٥.';

      return NextResponse.json({ success: false, error: { message } }, { status: 409 });
    }

    // Deliberately says "under review" rather than "published": promising
    // visibility that moderation has not granted is how a shop looks broken.
    return NextResponse.json({ success: true, data: { moderated: true } });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: { message: error.issues[0]?.message ?? 'بيانات غير صالحة' } },
        { status: 400 }
      );
    }
    console.error('Review submit error:', error);
    return NextResponse.json({ success: false, error: { message: 'تعذّر الإرسال' } }, { status: 500 });
  }
}
