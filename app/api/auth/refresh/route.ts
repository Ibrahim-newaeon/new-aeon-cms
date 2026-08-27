// app/api/auth/refresh/route.ts
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyRefreshToken, setAuthCookies, clearAuthCookies } from '@/lib/auth/session';
import { rotateRefreshToken } from '@/lib/auth/rotation';

export const runtime = 'nodejs';

const ADMIN_PATH = process.env.ADMIN_PATH || '/admin';

async function rotate(): Promise<{ ok: boolean; reason?: string }> {
  const store = await cookies();
  const token = store.get('refresh_token')?.value;
  if (!token) return { ok: false, reason: 'missing' };

  let claims: { sub: string; jti: string };
  try {
    claims = await verifyRefreshToken(token);
  } catch {
    return { ok: false, reason: 'invalid' };
  }

  const result = await rotateRefreshToken(claims.jti, claims.sub);

  if (!result.ok) {
    // Reuse means every session for this user was just revoked; clearing the
    // cookies here stops the browser retrying in a loop.
    await clearAuthCookies();
    return { ok: false, reason: result.reason };
  }

  await setAuthCookies(result.accessToken, result.refreshToken);
  return { ok: true };
}

/** Called by the client-side keeper before the access token expires. */
export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  if (origin && new URL(origin).host !== request.headers.get('host')) {
    return NextResponse.json({ success: false }, { status: 403 });
  }

  const result = await rotate();
  return NextResponse.json(
    { success: result.ok, ...(result.ok ? {} : { error: { reason: result.reason } }) },
    { status: result.ok ? 200 : 401 }
  );
}

/**
 * Navigation entry point. middleware cannot rotate — it runs on the Edge and
 * rotation needs the database — so it redirects here instead, and this handler
 * bounces the user back to where they were going.
 *
 * A GET that mutates is normally a CSRF risk, so this requires the request to
 * be a real top-level document navigation: an <img> or <script> pointing here
 * cannot set those Sec-Fetch headers.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);

  const mode = request.headers.get('sec-fetch-mode');
  const dest = request.headers.get('sec-fetch-dest');
  if (mode !== 'navigate' || dest !== 'document') {
    return NextResponse.json({ success: false }, { status: 403 });
  }

  // Only same-origin paths — never an absolute URL an attacker could supply.
  const raw = url.searchParams.get('next') ?? ADMIN_PATH;
  const next = raw.startsWith('/') && !raw.startsWith('//') ? raw : ADMIN_PATH;

  const result = await rotate();

  if (!result.ok) {
    return NextResponse.redirect(new URL(`${ADMIN_PATH}/login`, request.url));
  }

  return NextResponse.redirect(new URL(next, request.url));
}
