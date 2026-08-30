// app/api/account/register/route.ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { register, MIN_PASSWORD_LENGTH } from '@/lib/account/register';
import { normalisePhone, isValidMobile } from '@/lib/commerce/phone';
import { getStoreCountry } from '@/lib/commerce/regions';
import {
  createCustomerToken, setCustomerCookie, verifyPhoneProof,
} from '@/lib/auth/customer-session';
import { guard, fail } from '@/lib/account/http';
import { mergeSavedCart } from '@/lib/account/cart-sync';
import { rateLimit, clientKey } from '@/lib/rate-limit';

export const runtime = 'nodejs';

const schema = z.object({
  phone: z.string().trim().min(3).max(32),
  name: z.string().trim().min(2).max(255),
  password: z.string().min(MIN_PASSWORD_LENGTH).max(200),
  email: z.union([z.literal(''), z.string().email()]).nullable().optional(),
  /**
   * Signed by us after a one-time code was verified. REQUIRED for every
   * registration, not only for a phone that already has orders.
   *
   * Requiring it always is what closes the last way to ask "is this number a
   * customer here?". When it was conditional, the difference between "register
   * freely" and "prove it first" was itself the answer.
   *
   * `.nullable()` as well as `.optional()`: zod's optional accepts undefined
   * and NOT null, while a JSON client with nothing to send naturally sends
   * null.
   */
  phoneProof: z.string().max(2048).nullable().optional(),
});

export async function POST(request: Request) {
  const blocked = await guard(request);
  if (blocked) return blocked;

  const limit = await rateLimit(clientKey(request, 'account-register'), 5, 600);
  if (!limit.allowed) {
    return NextResponse.json(
      { success: false, error: { message: 'محاولات كثيرة. حاول لاحقاً.' } },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
    );
  }

  try {
    const data = schema.parse(await request.json());
    const country = await getStoreCountry();

    if (!isValidMobile(data.phone, country)) return fail('رقم هاتف غير صالح', 400);
    const phone = normalisePhone(data.phone, country);

    /**
     * The proof must be for THIS number. Without that check a valid proof for
     * any number would unlock every number — the classic confused-deputy shape.
     */
    const proven = data.phoneProof ? (await verifyPhoneProof(data.phoneProof)) === phone : false;

    // Refused before anything is looked up, so the response cannot depend on
    // whether the number is known.
    if (!proven) return fail('أكّد رقمك برمز أولاً.', 400);

    const result = await register({ ...data, phone }, proven);

    if (!result.ok) {
      if (result.reason === 'exists') {
        // Safe to say: they just proved they hold this number, so this tells
        // them about their OWN account and nobody else's.
        return NextResponse.json(
          { success: false, error: { message: 'لديك حساب بالفعل. سجّل الدخول.' }, data: { state: 'exists' } },
          { status: 409 }
        );
      }
      return fail(`كلمة المرور قصيرة (${MIN_PASSWORD_LENGTH} أحرف على الأقل)`, 400);
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
