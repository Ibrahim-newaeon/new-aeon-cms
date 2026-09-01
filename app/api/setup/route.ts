// app/api/setup/route.ts
import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { setupSchema, install } from '@/lib/setup/install';
import { needsSetup } from '@/lib/setup/status';
import { isSameOrigin } from '@/lib/auth/api-guard';
import { rateLimit, clientKey } from '@/lib/rate-limit';
import { createAccessToken, createRefreshToken, setAuthCookies } from '@/lib/auth/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Creates the first administrator. Unauthenticated, by necessity.
 *
 * Four gates, and each closes a different door:
 *
 *   1. Same-origin — this is a state-changing POST, so a third-party page must
 *      not be able to submit it on a visitor's behalf.
 *   2. Rate limited — an unauthenticated endpoint that hashes a password with
 *      argon2 (65536 KiB, 3 passes) is a denial-of-service lever if it can be
 *      called in a loop, quite apart from any guessing.
 *   3. needsSetup() — the cheap early exit, so a configured site does not even
 *      parse the body.
 *   4. The conditional INSERT in install() — the gate that actually holds.
 *      Gate 3 is a read, and two simultaneous requests can both pass it; only
 *      the database can decide this atomically.
 *
 * Gates 1–3 are courtesy. Gate 4 is the guarantee.
 */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json(
      { success: false, error: { message: 'Cross-site request blocked' } },
      { status: 403 }
    );
  }

  const limit = await rateLimit(clientKey(request, 'setup'), 10, 900);
  if (!limit.allowed) {
    return NextResponse.json(
      { success: false, error: { message: 'Too many attempts. Try again shortly.' } },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
    );
  }

  if (!(await needsSetup())) {
    // 409, not 403: nothing is wrong with the caller's credentials — the
    // resource simply cannot be created twice.
    return NextResponse.json(
      { success: false, error: { message: 'This site is already set up.' } },
      { status: 409 }
    );
  }

  let input;
  try {
    input = setupSchema.parse(await request.json());
  } catch (err) {
    const issues =
      err && typeof err === 'object' && 'issues' in err
        ? (err as { issues: { message: string }[] }).issues.map((i) => i.message)
        : ['Invalid input'];
    return NextResponse.json(
      { success: false, error: { message: issues[0] ?? 'Invalid input' } },
      { status: 400 }
    );
  }

  const result = await install(input);
  if (!result.ok) {
    return NextResponse.json(
      { success: false, error: { message: 'This site is already set up.' } },
      { status: 409 }
    );
  }

  /**
   * Signed straight in. The alternative is bouncing someone to a login form to
   * retype the password they just chose, which reads as the wizard having
   * failed. Same tokens the login route issues, so nothing here is a second
   * way to make a session.
   */
  const jti = randomUUID();
  const accessToken = await createAccessToken({
    sub: result.userId,
    email: input.email,
    name: input.name,
    role: 'admin',
    jti,
  });
  const refreshToken = await createRefreshToken(result.userId, jti);
  await setAuthCookies(accessToken, refreshToken);

  return NextResponse.json({ success: true, data: { demo: result.demo } });
}
