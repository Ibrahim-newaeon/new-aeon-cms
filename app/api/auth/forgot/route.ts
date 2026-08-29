// app/api/auth/forgot/route.ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { issueResetToken, RESET_TOKEN_TTL_MINUTES } from '@/lib/auth/password-reset';
import { rateLimit, clientKey } from '@/lib/rate-limit';
import { sendMail } from '@/lib/email/send';
import { passwordReset } from '@/lib/email/templates/password-reset';
import { getSettings } from '@/lib/db/queries';
import { getAdminLocale } from '@/lib/admin-i18n/server';

export const runtime = 'nodejs';

const schema = z.object({ email: z.string().trim().email().max(255) });

const ADMIN_PATH = process.env.ADMIN_PATH || '/admin';

/**
 * Always answers 200, whatever happened.
 *
 * The login endpoint deliberately gives the same message for a wrong password
 * and an unknown address so it cannot be used to enumerate users. A reset form
 * that replied "no such account" would hand back exactly what login refuses to,
 * so this one is silent about outcomes by design — including for a disabled
 * account, which must not be re-openable by its former owner.
 */
export async function POST(request: Request) {
  // Rate limited on the same scale as login. Without it this is a free
  // email-sending relay aimed at any address an attacker chooses.
  const limit = await rateLimit(clientKey(request, 'forgot'), 5, 900);
  if (!limit.allowed) {
    return NextResponse.json(
      { success: false, error: { message: 'محاولات كثيرة. حاول لاحقاً.' } },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
    );
  }

  try {
    const parsed = schema.safeParse(await request.json());
    // Even a malformed address gets the neutral answer — a 400 here would
    // distinguish "not an email" from "no such user", which is a smaller leak
    // but still a leak.
    if (!parsed.success) return NextResponse.json({ success: true });

    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
    const issued = await issueResetToken(parsed.data.email, ip);

    if (issued) {
      const settings = await getSettings();
      const base = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/+$/, '');
      const resetUrl = `${base}${ADMIN_PATH}/reset?token=${encodeURIComponent(issued.reset.token)}`;

      // Never able to fail the request: whether the mail went out is not
      // something the caller is allowed to learn anyway.
      await sendMail({
        to: issued.user.email,
        ...passwordReset({
          locale: await getAdminLocale(),
          storeName: settings?.siteName || 'New Aeon',
          userName: issued.user.name,
          resetUrl,
          expiresInMinutes: RESET_TOKEN_TTL_MINUTES,
        }),
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Password reset request error:', error);
    // Still 200. An error here must not become a signal either.
    return NextResponse.json({ success: true });
  }
}
