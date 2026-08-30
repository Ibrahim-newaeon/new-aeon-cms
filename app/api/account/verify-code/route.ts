// app/api/account/verify-code/route.ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyCode } from '@/lib/account/otp';
import { normalisePhone } from '@/lib/commerce/phone';
import { getStoreCountry } from '@/lib/commerce/regions';
import { commerceEnabled } from '@/lib/commerce/guard';
import { createCustomerToken, setCustomerCookie, createPhoneProof } from '@/lib/auth/customer-session';
import { rateLimit, clientKey } from '@/lib/rate-limit';
import { mergeSavedCart } from '@/lib/account/cart-sync';

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

    if (!result.customerId) {
      /**
       * The number is proven but has no account. Not a failure — it is where a
       * registration starts. The proof is returned as a signed token so the
       * register call can trust it; a boolean from the client would make the
       * code step decorative.
       */
      return NextResponse.json({
        success: true,
        data: { registered: false, phoneProof: await createPhoneProof(phone) },
      });
    }

    // Signing in brings a cart with it, in both directions — see
    // mergeSavedCart for why this merges rather than replaces.
    await mergeSavedCart(result.customerId);
    await setCustomerCookie(await createCustomerToken(result.customerId, phone));
    /**
     * `needsPassword` is true for a buyer the shop knows only because they
     * ordered. They are signed in — the code proved the number — but they
     * have no password yet, and without saying so the only way back in is
     * another code every time.
     */
    return NextResponse.json({
      success: true,
      data: { registered: true, needsPassword: !result.hasPassword },
    });
  } catch {
    return NextResponse.json({ success: false, error: { message: 'طلب غير صالح' } }, { status: 400 });
  }
}
