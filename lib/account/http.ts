// lib/account/http.ts
import { NextResponse } from 'next/server';
import { commerceEnabled } from '@/lib/commerce/guard';
import { currentCustomer, type CustomerToken } from '@/lib/auth/customer-session';

/** Shared guards for the storefront account endpoints. */

export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return request.headers.get('sec-fetch-site') === 'same-origin';
  try {
    return new URL(origin).host === request.headers.get('host');
  } catch {
    return false;
  }
}

export function fail(message: string, status: number) {
  return NextResponse.json({ success: false, error: { message } }, { status });
}

/**
 * Every account endpoint: shop must be on, and the request must be same-origin.
 * These are cookie-authenticated, so without the origin check any third-party
 * page could act as the signed-in shopper.
 */
export async function guard(request: Request): Promise<NextResponse | null> {
  if (!(await commerceEnabled())) return fail('Not found', 404);
  if (!sameOrigin(request)) return fail('Cross-site request blocked', 403);
  return null;
}

export type SessionResult =
  | { ok: true; customer: CustomerToken }
  | { ok: false; response: NextResponse };

/** Guard plus a signed-in shopper. */
export async function requireCustomer(request: Request): Promise<SessionResult> {
  const blocked = await guard(request);
  if (blocked) return { ok: false, response: blocked };

  const customer = await currentCustomer();
  if (!customer) return { ok: false, response: fail('Sign in first', 401) };
  return { ok: true, customer };
}
