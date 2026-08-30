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

    /**
     * ONE response for every failure — no account, no password set, wrong
     * password. Telling them apart would make this endpoint a way to ask
     * whether a given person shops here, and the customers table is names,
     * numbers and addresses.
     *
     * The buyer who has no password is not stranded by this: the sign-in form
     * always offers "send me a code", which works for any number and is how
     * they get in and set one.
     */
    if (!result.ok) return fail('الرقم أو كلمة المرور غير صحيحة.', 401);

    // Signing in brings a cart with it, in both directions — see
    // mergeSavedCart for why this merges rather than replaces.
    await mergeSavedCart(result.customerId);
    await setCustomerCookie(await createCustomerToken(result.customerId, phone));
    return NextResponse.json({ success: true });
  } catch {
    return fail('طلب غير صالح', 400);
  }
}
