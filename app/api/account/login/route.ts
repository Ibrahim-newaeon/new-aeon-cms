// app/api/account/login/route.ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { signInWithPassword } from '@/lib/account/register';
import { normalisePhone } from '@/lib/commerce/phone';
import { getStoreCountry } from '@/lib/commerce/regions';
import { createCustomerToken, setCustomerCookie } from '@/lib/auth/customer-session';
import { guard, fail } from '@/lib/account/http';
import { mergeSavedCart } from '@/lib/account/cart-sync';
import { rateLimit, clientKey } from '@/lib/rate-limit';

export const runtime = 'nodejs';

const schema = z.object({
  phone: z.string().trim().min(3).max(32),
  password: z.string().min(1).max(200),
});

export async function POST(request: Request) {
  const blocked = await guard(request);
  if (blocked) return blocked;

  const limit = await rateLimit(clientKey(request, 'account-login'), 10, 600);
  if (!limit.allowed) {
    return NextResponse.json(
      { success: false, error: { message: 'محاولات كثيرة. حاول لاحقاً.' } },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
    );
  }

  try {
    const data = schema.parse(await request.json());
    const phone = normalisePhone(data.phone, await getStoreCountry());
    const result = await signInWithPassword(phone, data.password);

    if (!result.ok) {
      /**
       * "not-registered" is told apart from a wrong password on purpose: a
       * known buyer who never set one needs to be offered the code flow, not
       * left guessing at a password that does not exist. It reveals only what
       * the person in front of us already knows — their own number — and the
       * alternative is a dead end for every existing customer of this shop.
       */
      if (result.reason === 'not-registered') {
        return NextResponse.json(
          {
            success: false,
            error: { message: 'لم تُنشئ كلمة مرور بعد. سجّل الدخول برمز.' },
            data: { state: 'not-registered' },
          },
          { status: 409 }
        );
      }
      // "no account" and "wrong password" share a message, so the endpoint
      // cannot be used to test whether a number is a customer here.
      return fail('الرقم أو كلمة المرور غير صحيحة.', 401);
    }

    // Signing in brings a cart with it, in both directions — see
    // mergeSavedCart for why this merges rather than replaces.
    await mergeSavedCart(result.customerId);
    await setCustomerCookie(await createCustomerToken(result.customerId, phone));
    return NextResponse.json({ success: true });
  } catch {
    return fail('طلب غير صالح', 400);
  }
}
