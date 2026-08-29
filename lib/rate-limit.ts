// lib/rate-limit.ts
import { env } from './env';

/**
 * Mega-prompt rule: "Rate limiting on all API routes."
 *
 * Two backends. Redis when REDIS_URL is set, an in-process Map otherwise.
 *
 * The in-process Map is correct for a single instance and for local
 * development, and useless the moment there is more than one: each instance
 * keeps its own counters, so a limit of 5 becomes 5-per-instance. Every caller
 * here is a security control — login brute-force, checkout denial-of-inventory,
 * form spam — so on a multi-instance deploy Redis is not optional.
 *
 * This module previously documented a Redis path that did not exist. That is
 * worse than having none: a deployer reads the comment, sets REDIS_URL, and
 * believes they are protected.
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

function memoryLimit(key: string, limit: number, windowSeconds: number): RateLimitResult {
  const now = Date.now();
  const windowMs = windowSeconds * 1000;

  sweep(now);

  const existing = memory.get(key);

  if (!existing || existing.resetAt <= now) {
    const bucket = { count: 1, resetAt: now + windowMs };
    memory.set(key, bucket);

    // The first request of a window is still checked against the limit. It was
    // previously returned as allowed unconditionally, so a limit of 0 — the
    // natural way to express "block this endpoint" — let one request per window
    // through and reported `remaining: -1`. The Redis path refuses it, so the
    // two backends disagreed.
    if (bucket.count > limit) {
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: Math.max(1, Math.ceil(windowMs / 1000)),
      };
    }

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

  return { allowed: true, remaining: Math.max(0, limit - existing.count), retryAfterSeconds: 0 };
}

/**
 * INCR and EXPIRE as one operation.
 *
 * Doing them as two commands leaves a window where the key exists with no TTL
 * — if the process dies in between, that key never expires and the client is
 * locked out permanently. The TTL is set only on the first increment, so the
 * window is fixed from the first request rather than sliding forward on every
 * subsequent one (which would let a steady stream of requests extend a ban
 * indefinitely).
 *
 * Returns [count, ttlSeconds].
 */
const SCRIPT = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('TTL', KEYS[1])
return {current, ttl}
`;

type RedisClient = import('ioredis').Redis;

let clientPromise: Promise<RedisClient | null> | null = null;

async function getRedis(): Promise<RedisClient | null> {
  if (!env.REDIS_URL) return null;
  if (clientPromise) return clientPromise;

  clientPromise = (async () => {
    try {
      const { default: Redis } = await import('ioredis');

      const client = new Redis(env.REDIS_URL!, {
        // Fail fast rather than queueing: a rate-limit check that blocks for
        // 30s is worse for the user than one that falls back to memory.
        connectTimeout: 2000,
        commandTimeout: 1000,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
        lazyConnect: true,
      });

      // ioredis emits 'error' on every reconnect attempt; without a listener
      // Node treats it as an unhandled error event and crashes the process.
      client.on('error', (error: Error & { code?: string }) => {
        // ioredis connection errors frequently have an empty `message`; the
        // `code` (ECONNREFUSED, ETIMEDOUT) is what actually identifies them.
        console.error('[rate-limit] redis error:', error.code || error.message || error.name);
      });

      await client.connect();
      return client;
    } catch (error) {
      console.error(
        '[rate-limit] could not connect to Redis, falling back to in-process limiting:',
        error instanceof Error ? error.message : error
      );
      return null;
    }
  })();

  return clientPromise;
}

export async function rateLimit(
  key: string,
  limit: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  const redis = await getRedis();
  if (!redis) return memoryLimit(key, limit, windowSeconds);

  try {
    const raw = (await redis.eval(SCRIPT, 1, `rl:${key}`, String(windowSeconds))) as [
      number,
      number,
    ];
    const count = Number(raw[0]);
    const ttl = Number(raw[1]);

    if (count > limit) {
      return {
        allowed: false,
        remaining: 0,
        // A -1 TTL means the key somehow lost its expiry; fall back to the
        // full window rather than reporting a nonsensical retry time.
        retryAfterSeconds: ttl > 0 ? ttl : windowSeconds,
      };
    }

    return { allowed: true, remaining: Math.max(0, limit - count), retryAfterSeconds: 0 };
  } catch (error) {
    // Degrade to in-process limiting rather than failing open entirely. A
    // Redis outage must not remove brute-force protection from the login
    // endpoint, and it must not take the site down either.
    console.error(
      '[rate-limit] redis command failed, falling back to in-process limiting:',
      error instanceof Error ? error.message : error
    );
    return memoryLimit(key, limit, windowSeconds);
  }
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

/**
 * Which backend is actually in use — not merely which one is configured.
 *
 * The previous `IS_DISTRIBUTED = Boolean(env.REDIS_URL)` was the same shape of
 * untruth as the old docstring: it reported intent. With REDIS_URL set but the
 * server unreachable, counters really are per-process, and anything relying on
 * this to decide whether limits are shared needs the truth.
 */
export async function rateLimitBackend(): Promise<'redis' | 'memory'> {
  return (await getRedis()) ? 'redis' : 'memory';
}

/** Test hook — drops the memoised client and the in-process buckets. */
export function __resetRateLimit(): void {
  clientPromise = null;
  memory.clear();
}

/** Exported for tests; the Redis path is exercised against a real server. */
export const __memoryLimit = memoryLimit;
