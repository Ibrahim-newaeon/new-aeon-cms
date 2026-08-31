// e2e/llms-txt.spec.ts
import { test, expect } from '@playwright/test';

/**
 * /llms.txt over HTTP.
 *
 * The document's RULES — drafts excluded, real slugs used, sections omitted
 * rather than guessed — are unit-tested against the pure builder in
 * tests/llms.test.ts, because this route is ISR-cached for an hour and those
 * rules cannot be observed by publishing something and reloading.
 *
 * What only a real request can prove is left here: it is served as plain text,
 * and every URL it advertises actually resolves. That second one is the point
 * of the file — a model cites what it is told, so a line pointing at a 404
 * teaches it that this shop is broken.
 */
test.use({
  storageState: { cookies: [], origins: [] },
  extraHTTPHeaders: { 'x-forwarded-for': '203.0.113.75' },
});

test('is served as plain text and is not empty', async ({ page }) => {
  const res = await page.goto('/llms.txt');
  expect(res?.status()).toBe(200);
  expect(res!.headers()['content-type']).toContain('text/plain');

  const text = await res!.text();
  expect(text.startsWith('# ')).toBe(true);
  expect(text).toContain('## Facts for citation');
});

test('every URL it advertises actually resolves', async ({ page, request }) => {
  const text = await (await page.goto('/llms.txt'))!.text();

  const urls = [...text.matchAll(/\]\((https?:\/\/[^)]+)\)/g)].map((m) => m[1]!);
  expect(urls.length, 'llms.txt advertises no links at all').toBeGreaterThan(2);

  for (const url of urls) {
    /**
     * Requested by PATH, not by the absolute URL.
     *
     * The file names the site's configured host — correct in production, but
     * here that is `localhost`, which Playwright's request context resolves to
     * ::1 while the server listens on 127.0.0.1, giving ECONNREFUSED for a
     * URL that is perfectly fine. The path is what is actually under test.
     */
    const path = new URL(url).pathname;
    const res = await request.get(path);
    expect(res.status(), `${path} is advertised but returns ${res.status()}`).toBe(200);
  }
});
