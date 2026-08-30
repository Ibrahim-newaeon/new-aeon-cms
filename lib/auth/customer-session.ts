// lib/auth/customer-session.ts
import { SignJWT, jwtVerify } from 'jose';
import { CUSTOMER_AUDIENCE } from './session';

/**
 * Shopper sessions.
 *
 * Deliberately separate from the admin session in three ways at once: a
 * different cookie name, a different audience, and a payload with no `role`
 * field at all. Any one of them would do; together they mean a customer token
 * cannot become a staff token through an oversight in a route handler.
 *
 * The audience is the load-bearing one — jose refuses to verify a token minted
 * for the other side, so this is enforced by the library rather than by
 * everyone remembering to pass an allowedRoles list.
 */

const SECRET = new TextEncoder().encode(process.env.JWT_ACCESS_SECRET!);

export const CUSTOMER_COOKIE = 'customer_session';

/** Long, because a shopper is not an admin: this is a convenience, not access. */
const SESSION_DAYS = 30;

export interface CustomerToken {
  sub: string;
  /** The canonical E.164 phone, i.e. the identity this session proves. */
  phone: string;
}

export async function createCustomerToken(customerId: string, phone: string): Promise<string> {
  return new SignJWT({ phone })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(customerId)
    .setIssuedAt()
    .setAudience(CUSTOMER_AUDIENCE)
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(SECRET);
}

export async function verifyCustomerToken(token: string): Promise<CustomerToken | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET, {
      clockTolerance: 60,
      audience: CUSTOMER_AUDIENCE,
    });
    const sub = payload.sub;
    const phone = payload.phone;
    if (typeof sub !== 'string' || typeof phone !== 'string') return null;
    return { sub, phone };
  } catch {
    return null;
  }
}

export async function setCustomerCookie(token: string) {
  const { cookies } = await import('next/headers');
  const store = await cookies();
  store.set(CUSTOMER_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    // `lax` rather than `strict`: a shopper following a link from an email or
    // a WhatsApp message should arrive already signed in. There is nothing
    // state-changing behind a GET here, and every POST checks the origin.
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * SESSION_DAYS,
  });
}

export async function clearCustomerCookie() {
  const { cookies } = await import('next/headers');
  const store = await cookies();
  store.delete(CUSTOMER_COOKIE);
}

/** The signed-in shopper, or null. Safe to call from any server component. */
export async function currentCustomer(): Promise<CustomerToken | null> {
  const { cookies } = await import('next/headers');
  const store = await cookies();
  const token = store.get(CUSTOMER_COOKIE)?.value;
  return token ? verifyCustomerToken(token) : null;
}
