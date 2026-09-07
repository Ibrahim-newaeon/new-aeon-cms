import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { isAllowedMediaDownloadUrl, resolveMediaDownloadSource } from '@/lib/media/download-url';
import { isCustomCssSafe, sanitizeCustomCss } from '@/lib/css/custom-css';
import { rateLimitConfigOk, __resetRateLimit } from '@/lib/rate-limit';
import { isSameOrigin } from '@/lib/auth/api-guard';
import { settingsSchema } from '@/lib/settings-schema';

describe('media download allowlist', () => {
  it('allows local upload paths', () => {
    expect(isAllowedMediaDownloadUrl('/uploads/2026/08/a.pdf')).toBe(true);
    expect(isAllowedMediaDownloadUrl('/uploads/../etc/passwd')).toBe(false);
  });

  it('blocks arbitrary absolute URLs (SSRF)', () => {
    expect(isAllowedMediaDownloadUrl('https://evil.example/steal')).toBe(false);
    expect(isAllowedMediaDownloadUrl('http://169.254.169.254/latest/meta-data/')).toBe(false);
  });

  it('resolves relative uploads against the request origin', () => {
    expect(resolveMediaDownloadSource('/uploads/a.pdf', 'https://shop.test/ar')).toBe(
      'https://shop.test/uploads/a.pdf'
    );
    expect(resolveMediaDownloadSource('https://evil.test/x', 'https://shop.test/')).toBeNull();
  });
});

describe('customCss sandbox', () => {
  it('rejects @import and javascript urls', () => {
    expect(isCustomCssSafe('@import url("https://evil.test/x.css");')).toBe(false);
    expect(isCustomCssSafe('a { background: url(javascript:alert(1)) }')).toBe(false);
    expect(isCustomCssSafe('div { color: red }')).toBe(true);
  });

  it('strips dangerous constructs', () => {
    const out = sanitizeCustomCss(
      '@import url("https://x"); .a{color:red} expression(alert(1)) url(data:text/css,x)'
    );
    expect(out).not.toContain('@import');
    expect(out).not.toContain('expression(');
    expect(out).toContain('blocked:');
  });

  it('settings schema rejects unsafe customCss', () => {
    const base = {
      siteName: 'Shop',
      comingSoonMode: false,
      eCommerceEnabled: false,
      currency: 'JOD',
    };
    expect(
      settingsSchema.safeParse({ ...base, customCss: '@import url("https://x");' }).success
    ).toBe(false);
    expect(settingsSchema.safeParse({ ...base, customCss: '.hero{color:#111}' }).success).toBe(
      true
    );
  });
});

describe('same-origin helper', () => {
  it('accepts matching Origin host', () => {
    const req = new Request('https://shop.test/api/auth/login', {
      method: 'POST',
      headers: { origin: 'https://shop.test', host: 'shop.test' },
    });
    expect(isSameOrigin(req)).toBe(true);
  });

  it('rejects cross-site Origin', () => {
    const req = new Request('https://shop.test/api/auth/logout', {
      method: 'POST',
      headers: { origin: 'https://evil.test', host: 'shop.test' },
    });
    expect(isSameOrigin(req)).toBe(false);
  });
});

describe('rateLimitConfigOk', () => {
  const prevAllow = process.env.ALLOW_IN_MEMORY_RATE_LIMIT;
  const prevRedis = process.env.REDIS_URL;

  beforeEach(() => {
    __resetRateLimit();
  });

  afterEach(() => {
    if (prevAllow === undefined) delete process.env.ALLOW_IN_MEMORY_RATE_LIMIT;
    else process.env.ALLOW_IN_MEMORY_RATE_LIMIT = prevAllow;
    if (prevRedis === undefined) delete process.env.REDIS_URL;
    else process.env.REDIS_URL = prevRedis;
    __resetRateLimit();
  });

  it('is ok outside production (vitest NODE_ENV is not production)', () => {
    // env.NODE_ENV is parsed at import; do not mutate process.env.NODE_ENV
    // (TypeScript marks it read-only). Production Redis gating is enforced by
    // rateLimitConfigOk + /api/health when NODE_ENV=production.
    expect(rateLimitConfigOk().ok).toBe(true);
  });

  it('passes with Redis configured', () => {
    process.env.REDIS_URL = 'redis://localhost:6379';
    delete process.env.ALLOW_IN_MEMORY_RATE_LIMIT;
    expect(rateLimitConfigOk().ok).toBe(true);
  });

  it('passes with ALLOW_IN_MEMORY_RATE_LIMIT escape hatch', () => {
    delete process.env.REDIS_URL;
    process.env.ALLOW_IN_MEMORY_RATE_LIMIT = 'true';
    expect(rateLimitConfigOk().ok).toBe(true);
  });
});
