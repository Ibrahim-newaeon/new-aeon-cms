// scripts/verify-rate-limit.ts
//
// Exercises the rate limiter against whichever backend the environment selects.
//
//   tsx --env-file=.env.redis-test scripts/verify-rate-limit.ts
//
// The Redis path cannot be unit-tested meaningfully: the whole point of it is
// that counters are shared across processes and that INCR+EXPIRE is atomic,
// neither of which a mock can demonstrate. So this runs against a real server.

import { rateLimit, rateLimitBackend, __resetRateLimit } from '../lib/rate-limit';

const ok = (m: string) => console.log(`  PASS  ${m}`);
const bad = (m: string) => {
  console.log(`  FAIL  ${m}`);
  process.exitCode = 1;
};

const uniq = (n: string) => `verify:${n}:${process.pid}:${Math.floor(performance.now() * 1000)}`;

async function main() {
  const backend = await rateLimitBackend();
  console.log(`backend: ${backend}
`);

  // ── the basic contract ─────────────────────────────────────────────────────
  {
    const key = uniq('basic');
    const results = [];
    for (let i = 0; i < 5; i++) results.push(await rateLimit(key, 3, 60));

    results.slice(0, 3).every((r) => r.allowed)
      ? ok('first 3 of a limit-3 window are allowed')
      : bad(`expected 3 allowed, got ${results.filter((r) => r.allowed).length}`);

    results.slice(3).every((r) => !r.allowed)
      ? ok('4th and 5th are refused')
      : bad('over-limit requests were allowed');

    results[0]!.remaining === 2 && results[2]!.remaining === 0
      ? ok('remaining counts down correctly')
      : bad(`remaining wrong: ${results.map((r) => r.remaining).join(',')}`);

    results[3]!.retryAfterSeconds > 0 && results[3]!.retryAfterSeconds <= 60
      ? ok(`retryAfter is a sane ${results[3]!.retryAfterSeconds}s`)
      : bad(`retryAfter is ${results[3]!.retryAfterSeconds}`);
  }

  // ── keys are independent ───────────────────────────────────────────────────
  {
    const a = uniq('sep-a');
    const b = uniq('sep-b');
    await rateLimit(a, 1, 60);
    const blockedA = await rateLimit(a, 1, 60);
    const freshB = await rateLimit(b, 1, 60);

    !blockedA.allowed && freshB.allowed
      ? ok('one key exhausting its limit does not affect another')
      : bad('keys are not independent');
  }

  // ── the window expires ─────────────────────────────────────────────────────
  {
    const key = uniq('expiry');
    await rateLimit(key, 1, 1);
    const blocked = await rateLimit(key, 1, 1);
    if (blocked.allowed) bad('second request inside a 1s window was allowed');

    await new Promise((r) => setTimeout(r, 1400));
    const after = await rateLimit(key, 1, 1);
    after.allowed ? ok('window expires and the caller is allowed again') : bad('window never expired');
  }

  // ── the window must not slide forward ──────────────────────────────────────
  {
    // EXPIRE on every increment would let a steady stream of requests extend a
    // ban indefinitely. The TTL is set only on the first hit.
    const key = uniq('fixed-window');
    await rateLimit(key, 2, 2);
    await new Promise((r) => setTimeout(r, 700));
    await rateLimit(key, 2, 2);
    await new Promise((r) => setTimeout(r, 700));
    const third = await rateLimit(key, 2, 2);
    if (third.allowed) bad('third request in a limit-2 window was allowed');

    await new Promise((r) => setTimeout(r, 900));
    const after = await rateLimit(key, 2, 2);
    after.allowed
      ? ok('window is fixed from the first request, not sliding')
      : bad('window slid forward — a steady stream would ban forever');
  }

  // ── concurrency: the count must not be lost to a race ──────────────────────
  {
    const key = uniq('concurrent');
    const results = await Promise.all(
      Array.from({ length: 20 }, () => rateLimit(key, 5, 60))
    );
    const allowed = results.filter((r) => r.allowed).length;

    allowed === 5
      ? ok('20 concurrent requests against a limit of 5 allowed exactly 5')
      : bad(`expected exactly 5 allowed, got ${allowed}`);
  }

  // ── shared across processes (Redis only) ───────────────────────────────────
  if (backend === 'redis') {
    const key = uniq('cross-process');
    await rateLimit(key, 2, 60);
    await rateLimit(key, 2, 60);

    // A fresh client with cleared in-process state stands in for a second
    // instance. If counters were per-process this would be allowed.
    __resetRateLimit();
    const fromOtherInstance = await rateLimit(key, 2, 60);

    !fromOtherInstance.allowed
      ? ok('counters are shared — a second instance sees the exhausted limit')
      : bad('counters are per-process; Redis is not actually being used');
  } else {
    // Reached both when REDIS_URL is unset and when it is set but the
    // server is unreachable — in the latter case per-process counting is the
    // correct degraded behaviour, so the check would rightly fail.
    console.log('  ..    skipping the cross-instance check (memory backend)');
  }

  console.log(process.exitCode ? '\nFAILURES ABOVE' : '\nall checks passed');
  process.exit(process.exitCode ?? 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
