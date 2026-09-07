// /app/api/auth/logout/route.ts
import { NextResponse } from 'next/server';
import { clearAuthCookies } from '@/lib/auth/session';
import { isSameOrigin } from '@/lib/auth/api-guard';

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json(
      { success: false, error: { message: 'Cross-site request blocked' } },
      { status: 403 }
    );
  }
  await clearAuthCookies();
  return NextResponse.json({ success: true });
}
