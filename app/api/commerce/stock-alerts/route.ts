// app/api/commerce/stock-alerts/route.ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { subscribeToStock } from '@/lib/commerce/stock-alerts';
import { commerceEnabled } from '@/lib/commerce/guard';
import { rateLimit, clientKey } from '@/lib/rate-limit';

export const runtime = 'nodejs';

const schema = z.object({
  variantId: z.string().uuid(),
  email: z.string().trim().email().max(255),
  locale: z.enum(['ar', 'en']).default('ar'),
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

export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ success: false }, { status: 403 });
  if (!(await commerceEnabled())) return NextResponse.json({ success: false }, { status: 404 });

  // This endpoint causes email to be sent to an address the caller chooses, so
  // it is limited like the other such endpoints.
  const limit = await rateLimit(clientKey(request, 'stock-alert'), 10, 3600);
  if (!limit.allowed) {
    return NextResponse.json(
      { success: false, error: { message: 'محاولات كثيرة. حاول لاحقاً.' } },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
    );
  }

  try {
    const data = schema.parse(await request.json());
    const result = await subscribeToStock(data.variantId, data.email, data.locale);

    if (result === 'not-found') {
      return NextResponse.json(
        { success: false, error: { message: 'المنتج غير موجود.' } },
        { status: 404 }
      );
    }

    if (result === 'in-stock') {
      // More useful than silently queueing a notification that would fire on
      // the spot.
      return NextResponse.json(
        { success: false, error: { code: 'IN_STOCK', message: 'المنتج متوفّر الآن.' } },
        { status: 409 }
      );
    }

    // `already` and `subscribed` answer the same: asking twice is not an error
    // worth showing, and the intent is recorded either way.
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: { message: 'بريد غير صالح' } },
        { status: 400 }
      );
    }
    console.error('Stock alert error:', error);
    return NextResponse.json({ success: false, error: { message: 'تعذّر التسجيل' } }, { status: 500 });
  }
}
