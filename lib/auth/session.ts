// /lib/auth/session.ts
import { SignJWT, jwtVerify } from 'jose';

const ACCESS_SECRET = new TextEncoder().encode(process.env.JWT_ACCESS_SECRET!);
const REFRESH_SECRET = new TextEncoder().encode(process.env.JWT_REFRESH_SECRET!);

/**
 * Who a token is FOR.
 *
 * Admin sessions and shopper sessions are signed with the same secret, so
 * without this claim a customer's token is cryptographically indistinguishable
 * from a staff token. Every admin route happens to pass an allowedRoles list
 * today, which would reject one — but that is a property of 56 call sites, not
 * of the design, and the next route added without a list would be a hole.
 *
 * jose enforces this during verification, so a token minted for the storefront
 * cannot be verified by the admin verifier at all.
 */
export const ADMIN_AUDIENCE = 'aeon:admin';
export const CUSTOMER_AUDIENCE = 'aeon:customer';

export interface TokenPayload {
  sub: string;
  email: string;
  name: string;
  role: 'admin' | 'editor' | 'author';
  jti: string;
  iat: number;
}

export async function createAccessToken(payload: Omit<TokenPayload, 'iat'>): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setAudience(ADMIN_AUDIENCE)
    .setExpirationTime('15m')
    .sign(ACCESS_SECRET);
}

export async function createRefreshToken(userId: string, jti: string): Promise<string> {
  return new SignJWT({ sub: userId, jti })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setAudience(ADMIN_AUDIENCE)
    .setExpirationTime('7d')
    .sign(REFRESH_SECRET);
}

export async function verifyAccessToken(token: string): Promise<TokenPayload> {
  // audience is enforced here, so a storefront token throws rather than
  // arriving at an admin route as a valid-looking session.
  const { payload } = await jwtVerify(token, ACCESS_SECRET, {
    clockTolerance: 60,
    audience: ADMIN_AUDIENCE,
  });
  return payload as unknown as TokenPayload;
}

export async function verifyRefreshToken(token: string): Promise<{ sub: string; jti: string }> {
  const { payload } = await jwtVerify(token, REFRESH_SECRET, {
    clockTolerance: 60,
    audience: ADMIN_AUDIENCE,
  });
  return payload as unknown as { sub: string; jti: string };
}

export async function setAuthCookies(access: string, refresh: string) {
  const { cookies } = await import('next/headers');
  const cookieStore = await cookies();
  cookieStore.set('access_token', access, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 60 * 15,
  });
  cookieStore.set('refresh_token', refresh, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function clearAuthCookies() {
  const { cookies } = await import('next/headers');
  const cookieStore = await cookies();
  cookieStore.delete('access_token');
  cookieStore.delete('refresh_token');
}
