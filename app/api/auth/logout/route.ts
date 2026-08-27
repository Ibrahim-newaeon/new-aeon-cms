// /app/api/auth/logout/route.ts
import { NextResponse } from 'next/server';
import { clearAuthCookies } from '@/lib/auth/session';

export async function POST() {
  await clearAuthCookies();
  return NextResponse.json({ success: true });
}
