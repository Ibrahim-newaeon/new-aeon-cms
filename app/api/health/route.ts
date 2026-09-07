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
  let envMod: typeof import('@/lib/env');
  try {
    envMod = await import('@/lib/env');
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

  const { rateLimitBackend, rateLimitConfigOk } = await import('@/lib/rate-limit');
  const rlOk = rateLimitConfigOk();
  const backend = await rateLimitBackend();

  // Production without Redis (and without the single-instance escape hatch)
  // is not ready for traffic — login/checkout limits would be per-process.
  if (!rlOk.ok) {
    return NextResponse.json(
      {
        status: 'error',
        message: rlOk.reason,
        rateLimit: backend,
      },
      { status: 503 }
    );
  }

  return NextResponse.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    rateLimit: backend,
    smsDriver: envMod.env.SMS_DRIVER === 'console' ? 'log' : envMod.env.SMS_DRIVER,
    whiteLabel: envMod.env.WHITE_LABEL === 'true',
  });
}
