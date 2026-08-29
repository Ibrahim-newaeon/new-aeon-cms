import { describe, it, expect, beforeEach } from 'vitest';

// No REDIS_URL, so the module selects its in-process backend. The Redis path is
// exercised against a real server by scripts/verify-rate-limit.ts — mocking it
// would prove nothing about the two properties that matter (atomic INCR+EXPIRE,
// and counters shared across processes).
delete process.env.REDIS_URL;
process.env.DATABASE_URL ||= 'postgresql://x:y@localhost:5432/z';
process.env.JWT_ACCESS_SECRET ||= 'test-access-secret-at-least-32-chars-long';
process.env.JWT_REFRESH_SECRET ||= 'test-refresh-secret-at-least-32-chars-diff';

const { rateLimit, clientKey, rateLimitBackend, __resetRateLimit } = await import(
  '@/lib/rate-limit'
);

beforeEach(() => __resetRateLimit());

const key = (() => {
  let n = 0;
  return () => `test-key-${(n += 1)}`;
})();

describe('backend selection', () => {
  it('reports memory when REDIS_URL is unset', async () => {
    expect(await rateLimitBackend()).toBe('memory');
  });
});

describe('rateLimit', () => {
  it('allows exactly `limit` requests then refuses', async () => {
    const k = key();
    const results = [];
    for (let i = 0; i < 5; i++) results.push(await rateLimit(k, 3, 60));

    expect(results.filter((r) => r.allowed)).toHaveLength(3);
    expect(results.slice(3).every((r) => !r.allowed)).toBe(true);
  });

  it('counts `remaining` down to zero and never below', async () => {
    const k = key();
    expect((await rateLimit(k, 3, 60)).remaining).toBe(2);
    expect((await rateLimit(k, 3, 60)).remaining).toBe(1);
    expect((await rateLimit(k, 3, 60)).remaining).toBe(0);
    expect((await rateLimit(k, 3, 60)).remaining).toBe(0);
  });

  it('reports retryAfter only when refusing', async () => {
    const k = key();
    const allowed = await rateLimit(k, 1, 60);
    const refused = await rateLimit(k, 1, 60);

    expect(allowed.retryAfterSeconds).toBe(0);
    expect(refused.retryAfterSeconds).toBeGreaterThan(0);
    expect(refused.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it('never reports a retryAfter of zero while refusing', async () => {
    // A Retry-After of 0 invites an immediate retry, which is the opposite of
    // what a refusal means. The floor is 1 second.
    const k = key();
    await rateLimit(k, 1, 1);
    const refused = await rateLimit(k, 1, 1);

    expect(refused.allowed).toBe(false);
    expect(refused.retryAfterSeconds).toBeGreaterThanOrEqual(1);
  });

  it('keeps separate keys independent', async () => {
    const a = key();
    const b = key();

    await rateLimit(a, 1, 60);
    expect((await rateLimit(a, 1, 60)).allowed).toBe(false);
    expect((await rateLimit(b, 1, 60)).allowed).toBe(true);
  });

  it('starts a fresh window once the old one expires', async () => {
    const k = key();
    await rateLimit(k, 1, 1);
    expect((await rateLimit(k, 1, 1)).allowed).toBe(false);

    await new Promise((r) => setTimeout(r, 1100));
    expect((await rateLimit(k, 1, 1)).allowed).toBe(true);
  });

  it('holds under concurrent calls', async () => {
    const k = key();
    const results = await Promise.all(Array.from({ length: 20 }, () => rateLimit(k, 5, 60)));

    expect(results.filter((r) => r.allowed)).toHaveLength(5);
  });

  it('treats a limit of zero as refusing everything', async () => {
    expect((await rateLimit(key(), 0, 60)).allowed).toBe(false);
  });
});

describe('clientKey', () => {
  const req = (headers: Record<string, string>) => new Request('https://x.test', { headers });

  it('uses the first address in X-Forwarded-For', async () => {
    // The first entry is the original client; the rest are proxies.
    expect(clientKey(req({ 'x-forwarded-for': '1.2.3.4, 10.0.0.1' }), 'login')).toBe(
      'login:1.2.3.4'
    );
  });

  it('trims whitespace around the address', () => {
    expect(clientKey(req({ 'x-forwarded-for': '  1.2.3.4  ' }), 'login')).toBe('login:1.2.3.4');
  });

  it('falls back to X-Real-IP, then to a constant', () => {
    expect(clientKey(req({ 'x-real-ip': '5.6.7.8' }), 'forms')).toBe('forms:5.6.7.8');
    expect(clientKey(req({}), 'forms')).toBe('forms:unknown');
  });

  it('scopes the key, so one endpoint cannot exhaust another', () => {
    const headers = { 'x-forwarded-for': '1.2.3.4' };
    expect(clientKey(req(headers), 'login')).not.toBe(clientKey(req(headers), 'checkout'));
  });

  it('ignores an empty X-Forwarded-For rather than keying on an empty string', () => {
    // Otherwise every client sending a blank header shares one bucket.
    expect(clientKey(req({ 'x-forwarded-for': '' }), 'login')).toBe('login:unknown');
  });
});
