// lib/auth/api-guard.ts
import { NextResponse } from 'next/server';
import { verifyAccessToken, type TokenPayload } from './session';

/**
 * middleware.ts early-returns on `pathname.startsWith('/api/')`, so API route
 * handlers get NO authentication from it. Every mutating route must call this
 * guard itself.
 */
export type GuardResult =
  | { ok: true; user: TokenPayload }
  | { ok: false; response: NextResponse };

function deny(message: string, status: number): GuardResult {
  return {
    ok: false,
    response: NextResponse.json({ success: false, error: { message } }, { status }),
  };
}

/**
 * Rejects cross-site form posts. `DataTable` deletes via a plain
 * <form method="POST">, which any third-party page can submit; without this
 * check that is a one-click content-wipe CSRF.
 *
 * Same-origin requests send Origin matching the host (or omit it for
 * same-origin GETs, which never reach this guard).
 */
function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) {
    // No Origin at all: only trust it when the browser marks it same-origin.
    return request.headers.get('sec-fetch-site') === 'same-origin';
  }
  try {
    return new URL(origin).host === request.headers.get('host');
  } catch {
    return false;
  }
}

export async function requireApiAuth(
  request: Request,
  allowedRoles?: ReadonlyArray<TokenPayload['role']>
): Promise<GuardResult> {
  if (!isSameOrigin(request)) {
    return deny('Cross-site request blocked', 403);
  }

  const { cookies } = await import('next/headers');
  const cookieStore = await cookies();
  const token = cookieStore.get('access_token')?.value;

  if (!token) return deny('Authentication required', 401);

  let user: TokenPayload;
  try {
    user = await verifyAccessToken(token);
  } catch {
    return deny('Invalid or expired session', 401);
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return deny('Insufficient permissions', 403);
  }

  return { ok: true, user };
}
