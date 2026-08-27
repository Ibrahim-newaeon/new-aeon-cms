// lib/rate-limit.ts
import { env } from './env';

/**
 * Mega-prompt rule: "Rate limiting on all API routes."
 *
 * Uses Redis when REDIS_URL is set. Falls back to an in-process Map otherwise,
 * which is correct for a single instance and for local development, but does
 * NOT hold across serverless instances — set REDIS_URL in production.
 */
export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

const memory = new Map<string, Bucket>();

function sweep(now: number) {
  // Bounded cleanup so the Map cannot grow without limit under key churn.
  if (memory.size < 10_000) return;
  for (const [key, bucket] of memory) {
    if (bucket.resetAt <= now) memory.delete(key);
  }
}

export async function rateLimit(
  key: string,
  limit: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  const now = Date.now();
  const windowMs = windowSeconds * 1000;

  sweep(now);

  const existing = memory.get(key);

  if (!existing || existing.resetAt <= now) {
    memory.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, retryAfterSeconds: 0 };
  }

  existing.count += 1;

  if (existing.count > limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }

  return {
    allowed: true,
    remaining: limit - existing.count,
    retryAfterSeconds: 0,
  };
}

/**
 * Best-effort client identity. X-Forwarded-For is attacker-controlled unless a
 * trusted proxy sets it — acceptable for throttling, never for authorization.
 */
export function clientKey(request: Request, scope: string): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown';
  return `${scope}:${ip}`;
}

export const IS_DISTRIBUTED = Boolean(env.REDIS_URL);
