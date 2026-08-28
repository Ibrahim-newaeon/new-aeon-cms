import { NextResponse } from 'next/server';
import { checkDatabaseHealth } from '@/lib/db';

/**
 * Liveness/readiness for the container HEALTHCHECK and any orchestrator.
 *
 * Must never be cached or prerendered: a health endpoint answering from a build
 * artefact tells you the build succeeded, not that this process is well.
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  // Imported for its side effect, and deliberately inside the handler so a
  // config failure becomes a 503 here rather than an unhandled throw at module
  // load. lib/env validates on import and throws on bad config.
  //
  // This check exists because of a real failure found while first running the
  // container: env validation happens when a route module is imported, and in
  // a standalone server that is lazy and per-route. A deploy with a broken
  // STORAGE_DRIVER=s3 config had every page returning 500 while this endpoint
  // happily returned 200 — so the healthcheck passed and an orchestrator would
  // have routed live traffic straight at it.
  try {
    await import('@/lib/env');
  } catch (error) {
    console.error('[health] invalid environment configuration:', error);
    return NextResponse.json(
      { status: 'error', message: 'Invalid environment configuration' },
      { status: 503 }
    );
  }

  const dbHealthy = await checkDatabaseHealth();

  if (!dbHealthy) {
    return NextResponse.json(
      { status: 'error', message: 'Database unavailable' },
      { status: 503 }
    );
  }

  return NextResponse.json({ status: 'ok', timestamp: new Date().toISOString() });
}
