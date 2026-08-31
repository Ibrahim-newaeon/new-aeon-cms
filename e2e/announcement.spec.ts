// e2e/announcement.spec.ts
import { test, expect } from '@playwright/test';
import { withDb } from './fixtures';

/**
 * The promo strip above the navbar.
 *
 * Its whole job is to appear and disappear on command, so that is what is
 * tested — including the case a single-language shop falls into without
 * noticing: copy in Arabic only, and an Arabic strip over an English page.
 */
test.use({
  storageState: { cookies: [], origins: [] },
  extraHTTPHeaders: { 'x-forwarded-for': '203.0.113.73' },
});

const AR = 'توصيل داخل الأردن · تغليف هدايا فاخر';
const EN = 'Delivery across Jordan · luxury gift wrapping';

async function set(ar: string | null, en: string | null, active: boolean) {
  await withDb(async (db) => {
    await db.query(
      'update settings set announcement_ar = $1, announcement_en = $2, announcement_active = $3',
      [ar, en, active]
    );
  });
}

let saved: { ar: string | null; en: string | null; active: boolean } | null = null;

test.beforeAll(async () => {
  saved = await withDb(async (db) => {
    const r = await db.query(
      'select announcement_ar, announcement_en, announcement_active from settings limit 1'
    );
    return {
      ar: r.rows[0]?.announcement_ar ?? null,
      en: r.rows[0]?.announcement_en ?? null,
      active: r.rows[0]?.announcement_active ?? false,
    };
  });
});

test.afterAll(async () => {
  if (saved) await set(saved.ar, saved.en, saved.active);
});

test('shows the right language on each site', async ({ page }) => {
  await set(AR, EN, true);

  await page.goto('/en');
  await expect(page.getByTestId('announcement-bar')).toHaveText(EN);

  await page.goto('/ar');
  await expect(page.getByTestId('announcement-bar')).toHaveText(AR);
});

test('the toggle turns it off without losing the text', async ({ page }) => {
  await set(AR, EN, false);
  await page.goto('/en');
  await expect(page.getByTestId('announcement-bar')).toHaveCount(0);

  // The copy survives being switched off — the point of a separate toggle.
  const kept = await withDb(async (db) => {
    const r = await db.query('select announcement_en from settings limit 1');
    return r.rows[0]?.announcement_en;
  });
  expect(kept).toBe(EN);
});

test('a language with no copy gets no bar', async ({ page }) => {
  // Arabic only. The English page must show nothing rather than an Arabic
  // strip a reader cannot understand.
  await set(AR, null, true);

  await page.goto('/ar');
  await expect(page.getByTestId('announcement-bar')).toHaveText(AR);

  await page.goto('/en');
  await expect(page.getByTestId('announcement-bar')).toHaveCount(0);
});

test('it sits above the navbar and scrolls away', async ({ page }) => {
  await set(AR, EN, true);
  await page.goto('/en');

  const bar = page.getByTestId('announcement-bar');
  const nav = page.locator('nav').first();
  const [b, n] = [await bar.boundingBox(), await nav.boundingBox()];
  expect(b!.y + b!.height).toBeLessThanOrEqual(n!.y + 1);

  // The navbar is sticky; pinning the bar too would spend two rows of a phone
  // screen on chrome, so it must leave the viewport on scroll.
  await page.evaluate(() => window.scrollTo(0, 600));
  await page.waitForTimeout(150);
  const after = await bar.boundingBox();
  expect(after === null || after.y + after.height <= 0).toBe(true);
});

test('it does not push the page sideways on a phone', async ({ page }) => {
  await set(AR, EN, true);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/ar');
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
