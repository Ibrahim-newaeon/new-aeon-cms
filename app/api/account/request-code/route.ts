// app/api/account/request-code/route.ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requestCode } from '@/lib/account/otp';
import { normalisePhone, isValidMobile } from '@/lib/commerce/phone';
import { getStoreCountry } from '@/lib/commerce/regions';
import { commerceEnabled } from '@/lib/commerce/guard';
import { rateLimit, clientKey } from '@/lib/rate-limit';

export const runtime = 'nodejs';

const schema = z.object({
  phone: z.string().trim().min(3).max(32),
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
  if (!(await commerceEnabled())) {
    return NextResponse.json({ success: false, error: { message: 'Not found' } }, { status: 404 });
  }
  if (!sameOrigin(request)) {
    return NextResponse.json({ success: false, error: { message: 'Cross-site request blocked' } }, { status: 403 });
  }

  // Sending an SMS costs money and reaches someone's phone, so this is limited
  // harder than an ordinary form: 3 per 10 minutes per client.
  const limit = await rateLimit(clientKey(request, 'account-code'), 3, 600);
  if (!limit.allowed) {
    return NextResponse.json(
      { success: false, error: { message: 'محاولات كثيرة. حاول لاحقاً.' } },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
    );
  }

  try {
    const data = schema.parse(await request.json());
    const country = await getStoreCountry();

    if (!isValidMobile(data.phone, country)) {
      return NextResponse.json(
        { success: false, error: { message: 'رقم هاتف غير صالح' } },
        { status: 400 }
      );
    }

    const phone = normalisePhone(data.phone, country);
    await requestCode(phone, data.locale);

    /**
     * The SAME response whether or not that number has an account.
     *
     * Saying "no account with this number" would turn this endpoint into a way
     * to test whether a given person shops here — the customer table is names,
     * numbers and addresses. The shopper who mistypes their number learns it
     * from the code never arriving, which is the same thing every bank does.
     */
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false, error: { message: 'طلب غير صالح' } }, { status: 400 });
  }
}
