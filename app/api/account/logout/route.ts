// app/api/account/logout/route.ts
import { NextResponse } from 'next/server';
import { clearCustomerCookie } from '@/lib/auth/customer-session';

export const runtime = 'nodejs';

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return request.headers.get('sec-fetch-site') === 'same-origin';
  try {
    return new URL(origin).host === request.headers.get('host');
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ success: false, error: { message: 'Cross-site request blocked' } }, { status: 403 });
  }
  await clearCustomerCookie();
  return NextResponse.json({ success: true });
}
