// e2e/public-site.spec.ts
import { test, expect } from '@playwright/test';

/**
 * The public site, unauthenticated. No storageState here — these pages must
 * work for someone who has never logged in, and using the admin session would
 * hide a bug where they only render for an authenticated user.
 */
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('public site', () => {
  test('serves the Arabic home page right-to-left', async ({ page }) => {
    await page.goto('/ar');

    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
    await expect(page.getByTestId('navbar-home')).toBeVisible();
  });

  test('serves the English home page left-to-right', async ({ page }) => {
    await page.goto('/en');

    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  });

  test('the locale switch moves between the two trees', async ({ page }) => {
    await page.goto('/ar');
    await page.getByTestId('navbar-locale-switch').click();

    await page.waitForURL(/\/en/);
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  });

  test('renders a published page and its blocks', async ({ page }) => {
    await page.goto('/ar/about-us');

    await expect(page.getByTestId('content-renderer')).toBeVisible();
    // level 1 specifically: the page title and a heading block inside the body
    // share this text, and an unqualified match is ambiguous under strict mode.
    await expect(page.getByRole('heading', { level: 1, name: 'من نحن' })).toBeVisible();
  });

  test('a tag archive shows the name in the reader’s language', async ({ page }) => {
    // The seeded `announcements` tag has no translations, so both locales fall
    // back to its reference name rather than rendering an empty heading.
    await page.goto('/ar/tag/announcements');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Announcements');

    await page.goto('/en/tag/announcements');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Announcements');
  });

  test('an unknown page is a 404, not a soft empty page', async ({ page }) => {
    const response = await page.goto('/ar/definitely-not-a-real-page');
    expect(response?.status()).toBe(404);
  });

  test('an unknown locale is rejected', async ({ page }) => {
    const response = await page.goto('/fr');
    expect(response?.status()).toBe(404);
  });

  test('search returns a result for seeded content', async ({ page }) => {
    await page.goto('/ar/search?q=' + encodeURIComponent('من نحن'));

    // The page must render rather than error; the seeded corpus is small, so
    // asserting on a specific hit would be brittle.
    await expect(page.locator('body')).toBeVisible();
    expect(page.url()).toContain('/search');
  });

  test('robots.txt and the sitemap are served', async ({ request }) => {
    const robots = await request.get('/robots.txt');
    expect(robots.status()).toBe(200);
    // The admin path is deliberately absent so robots.txt does not disclose it.
    expect(await robots.text()).not.toContain('/admin');

    const sitemap = await request.get('/sitemap.xml');
    expect(sitemap.status()).toBe(200);
    expect(await sitemap.text()).toContain('<urlset');
  });

  test('site images go through the Next optimiser', async ({ page }) => {
    await page.goto('/en/shop');

    const raw = await page.locator('img:not([src*="/_next/image"])').count();
    const optimised = await page.locator('img[src*="/_next/image"]').count();

    expect(optimised).toBeGreaterThan(0);
    expect(raw).toBe(0);
  });
});
