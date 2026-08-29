// app/api/auth/reset/route.ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { redeemResetToken, PASSWORD_MIN_LENGTH } from '@/lib/auth/password-reset';
import { rateLimit, clientKey } from '@/lib/rate-limit';

export const runtime = 'nodejs';

const schema = z.object({
  token: z.string().min(10).max(512),
  password: z.string().min(PASSWORD_MIN_LENGTH).max(200),
});

export async function POST(request: Request) {
  // A token is 32 random bytes, so guessing is not the threat — but an
  // unlimited endpoint that runs Argon2 on every call is a cheap way to burn
  // the server's CPU.
  const limit = await rateLimit(clientKey(request, 'reset'), 10, 900);
  if (!limit.allowed) {
    return NextResponse.json(
      { success: false, error: { message: 'محاولات كثيرة. حاول لاحقاً.' } },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
    );
  }

  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: { message: `كلمة المرور يجب أن تكون ${PASSWORD_MIN_LENGTH} حرفاً على الأقل.` },
        },
        { status: 400 }
      );
    }

    const result = await redeemResetToken(parsed.data.token, parsed.data.password);

    if (!result.ok) {
      const message =
        result.reason === 'WEAK_PASSWORD'
          ? `كلمة المرور يجب أن تكون ${PASSWORD_MIN_LENGTH} حرفاً على الأقل.`
          : 'هذا الرابط غير صالح أو انتهت صلاحيته. اطلب رابطاً جديداً.';

      // 400 for both. An expired token and a forged one are indistinguishable
      // to the caller on purpose — the distinction only helps someone probing.
      return NextResponse.json({ success: false, error: { message } }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Password reset error:', error);
    return NextResponse.json(
      { success: false, error: { message: 'تعذّر إعادة التعيين' } },
      { status: 500 }
    );
  }
}
