// lib/commerce/checkout-token.ts
import 'server-only';
import { SignJWT, jwtVerify } from 'jose';
import { randomUUID } from 'node:crypto';

const SECRET = new TextEncoder().encode(process.env.JWT_ACCESS_SECRET);

/**
 * A one-time checkout token, signed and rendered into the form.
 *
 * NOT a cookie: Next.js forbids setting cookies during a Server Component
 * render, and a single cookie would also collide across browser tabs. A signed
 * token travels with the form, and single-use is enforced by a UNIQUE index on
 * orders.idempotency_key — which, unlike an application-level check, holds when
 * two submissions race.
 */
export async function mintCheckoutToken(): Promise<string> {
  return new SignJWT({ jti: randomUUID() })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(SECRET);
}

/** Returns the token's unique id, or null when forged or expired. */
export async function verifyCheckoutToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return typeof payload.jti === 'string' ? payload.jti : null;
  } catch {
    return null;
  }
}
