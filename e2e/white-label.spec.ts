// e2e/white-label.spec.ts
import { test, expect } from '@playwright/test';
import { withDb, ADMIN_PATH } from './fixtures';

/**
 * The admin wearing the client's brand.
 *
 * The thing under test is not "a setting saves" but "a second client does not
 * see the first client's name", so these assert what is RENDERED on the panel —
 * the sidebar mark, the browser title, the computed colour of a button — rather
 * than what is in the database.
 */
test.use({ extraHTTPHeaders: { 'x-forwarded-for': '203.0.113.62' } });

const CLIENT = 'Juman Lady';
const ACCENT = '#0369a1';

let saved: { siteName: string; adminAccent: string | null; adminLogo: string | null } | null = null;

test.beforeAll(async () => {
  saved = await withDb(async (db) => {
    const r = await db.query('select site_name, admin_accent, admin_logo from settings limit 1');
    return {
      siteName: r.rows[0]?.site_name ?? 'New Aeon',
      adminAccent: r.rows[0]?.admin_accent ?? null,
      adminLogo: r.rows[0]?.admin_logo ?? null,
    };
  });
  await withDb(async (db) => {
    await db.query('update settings set site_name = $1, admin_accent = $2, admin_logo = null', [
      CLIENT,
      ACCENT,
    ]);
  });
});

test.afterAll(async () => {
  if (!saved) return;
  await withDb(async (db) => {
    await db.query('update settings set site_name = $1, admin_accent = $2, admin_logo = $3', [
      saved!.siteName,
      saved!.adminAccent,
      saved!.adminLogo,
    ]);
  });
});

test('the sidebar says the client name, not ours', async ({ page }) => {
  await page.goto(ADMIN_PATH);

  const mark = page.getByLabel(CLIENT).first();
  await expect(mark).toBeVisible();
  await expect(mark).toHaveText(/JUMAN\s*LADY/);

  // The specific regression: the wordmark used to be the literal "NEW AEON",
  // so every client's panel carried the first client's name.
  await expect(page.locator('aside')).not.toContainText('AEON');
});

test('the browser tab carries the client name', async ({ page }) => {
  await page.goto(ADMIN_PATH);
  await expect(page).toHaveTitle(new RegExp(CLIENT));
});

test('the accent reaches the actual buttons', async ({ page }) => {
  await page.goto(`${ADMIN_PATH}/settings`);

  // Computed, not the <style> text: the override has to WIN over the :root
  // defaults, and only the resolved value proves that.
  const accent = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--admin-accent').trim()
  );
  expect(accent).toBe(ACCENT);

  const button = page.getByTestId('settings-save');
  await expect(button).toBeVisible();
  expect(await button.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(
    'rgb(3, 105, 161)'
  );
});

test('text on the accent stays readable', async ({ page }) => {
  // #130c0e was hardcoded as the button text — correct on yellow, unreadable on
  // this navy. The ink is now derived, and this is the assertion that says so
  // in the browser rather than in a unit test.
  await page.goto(`${ADMIN_PATH}/settings`);
  const button = page.getByTestId('settings-save');

  const [fg, bg] = [
    await button.evaluate((el) => getComputedStyle(el).color),
    await button.evaluate((el) => getComputedStyle(el).backgroundColor),
  ];

  const lum = (rgb: string) => {
    const [r, g, b] = rgb.match(/\d+/g)!.slice(0, 3).map((n) => Number(n) / 255);
    const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    return 0.2126 * lin(r!) + 0.7152 * lin(g!) + 0.0722 * lin(b!);
  };
  const [hi, lo] = [lum(fg), lum(bg)].sort((a, b) => b - a);
  expect((hi! + 0.05) / (lo! + 0.05)).toBeGreaterThanOrEqual(4.5);
});

test('the login screen is branded too', async ({ page }) => {
  // The only page a locked-out client sees.
  await page.context().clearCookies();
  await page.goto(`${ADMIN_PATH}/login`);

  await expect(page).toHaveTitle(new RegExp(CLIENT));
  const accent = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--admin-accent').trim()
  );
  expect(accent).toBe(ACCENT);
});
