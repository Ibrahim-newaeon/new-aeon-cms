import { NextResponse } from 'next/server';
import { checkDatabaseHealth } from '@/lib/db';

export async function GET() {
  const dbHealthy = await checkDatabaseHealth();
  
  if (!dbHealthy) {
    return NextResponse.json(
      { status: 'error', message: 'Database unavailable' },
      { status: 503 }
    );
  }

  return NextResponse.json({ status: 'ok', timestamp: new Date().toISOString() });
}
