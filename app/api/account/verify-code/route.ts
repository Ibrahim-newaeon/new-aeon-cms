// app/api/account/verify-code/route.ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyCode } from '@/lib/account/otp';
import { normalisePhone } from '@/lib/commerce/phone';
import { getStoreCountry } from '@/lib/commerce/regions';
import { commerceEnabled } from '@/lib/commerce/guard';
import { createCustomerToken, setCustomerCookie } from '@/lib/auth/customer-session';
import { rateLimit, clientKey } from '@/lib/rate-limit';

export const runtime = 'nodejs';

const schema = z.object({
  phone: z.string().trim().min(3).max(32),
  code: z.string().trim().regex(/^\d{6}$/, 'رمز غير صالح'),
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

const MESSAGE: Record<string, string> = {
  'no-code': 'اطلب رمزاً جديداً.',
  expired: 'انتهت صلاحية الرمز. اطلب رمزاً جديداً.',
  wrong: 'الرمز غير صحيح.',
  locked: 'محاولات كثيرة. اطلب رمزاً جديداً.',
};

export async function POST(request: Request) {
  if (!(await commerceEnabled())) {
    return NextResponse.json({ success: false, error: { message: 'Not found' } }, { status: 404 });
  }
  if (!sameOrigin(request)) {
    return NextResponse.json({ success: false, error: { message: 'Cross-site request blocked' } }, { status: 403 });
  }

  // Per-client on top of the per-code attempt counter: the counter stops
  // guessing at ONE number, this stops sweeping across many.
  const limit = await rateLimit(clientKey(request, 'account-verify'), 10, 600);
  if (!limit.allowed) {
    return NextResponse.json(
      { success: false, error: { message: 'محاولات كثيرة. حاول لاحقاً.' } },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
    );
  }

  try {
    const data = schema.parse(await request.json());
    const phone = normalisePhone(data.phone, await getStoreCountry());

    const result = await verifyCode(phone, data.code);
    if (!result.ok) {
      return NextResponse.json(
        { success: false, error: { message: MESSAGE[result.reason] ?? 'الرمز غير صحيح.' } },
        { status: 400 }
      );
    }

    await setCustomerCookie(await createCustomerToken(result.customerId, phone));
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false, error: { message: 'طلب غير صالح' } }, { status: 400 });
  }
}
