// app/api/account/register/route.ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { register, claimState, MIN_PASSWORD_LENGTH } from '@/lib/account/register';
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
   * Signed by us after a code was verified. Required to claim a phone that
   * already has orders behind it.
   *
   * `.nullable()` as well as `.optional()`: zod's optional accepts undefined
   * and NOT null, while a JSON client with nothing to send naturally sends
   * null. Omitting it rejected every ordinary registration with "invalid
   * request" and no clue which field was wrong.
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

    const result = await register({ ...data, phone }, proven);

    if (!result.ok) {
      if (result.reason === 'exists') {
        return NextResponse.json(
          { success: false, error: { message: 'لديك حساب بالفعل. سجّل الدخول.' }, data: { state: 'exists' } },
          { status: 409 }
        );
      }
      if (result.reason === 'needs-verification') {
        // There are orders behind this number. Prove it is yours first.
        return NextResponse.json(
          {
            success: false,
            error: { message: 'لهذا الرقم طلبات سابقة. أكّد ملكيته برمز أولاً.' },
            data: { state: 'needs-verification' },
          },
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

/**
 * What a number is, so the form can ask for a password or a name rather than
 * making the person guess which they need.
 *
 * This DOES reveal whether a number is a customer here, which the code-request
 * endpoint deliberately does not. It is the same trade every shop with a
 * separate Login and Register makes, and the alternative — sending an SMS
 * before we know whether one is needed — costs money on every sign-in.
 *
 * Rate limited because it is unauthenticated and answers a question about
 * other people: 20 in ten minutes is a person filling in a form, not a list
 * being checked against the customer table.
 */
export async function GET(request: Request) {
  const blocked = await guard(request);
  if (blocked) return blocked;

  const limit = await rateLimit(clientKey(request, 'account-state'), 20, 600);
  if (!limit.allowed) {
    return NextResponse.json(
      { success: false, error: { message: 'محاولات كثيرة. حاول لاحقاً.' } },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
    );
  }

  const raw = new URL(request.url).searchParams.get('phone') ?? '';
  const country = await getStoreCountry();
  if (!isValidMobile(raw, country)) return NextResponse.json({ success: true, data: { state: 'invalid' } });

  return NextResponse.json({
    success: true,
    data: { state: await claimState(normalisePhone(raw, country)) },
  });
}
