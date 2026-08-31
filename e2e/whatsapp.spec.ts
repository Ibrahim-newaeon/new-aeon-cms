// e2e/whatsapp.spec.ts
import { test, expect } from '@playwright/test';
import { withDb } from './fixtures';

/**
 * The WhatsApp button.
 *
 * A plain anchor, so most of what matters is that the link is correct and that
 * it appears on the right side of the screen in each language.
 */
test.use({ storageState: { cookies: [], origins: [] } });

async function configured() {
  return withDb(async (db) => {
    const r = await db.query('select whatsapp_number from settings limit 1');
    return Boolean(r.rows[0]?.whatsapp_number);
  });
}

test.describe('WhatsApp button', () => {
  test('appears on the storefront and links to wa.me', async ({ page }) => {
    test.skip(!(await configured()), 'no WhatsApp number set');

    await page.goto('/en');
    const button = page.getByTestId('whatsapp-button');
    await expect(button).toBeVisible();

    const href = await button.getAttribute('href');
    expect(href).toMatch(/^https:\/\/wa\.me\/\d{6,}/);
    // wa.me rejects a + in the path.
    expect(href).not.toContain('+');
    // Opening a third-party origin in a new tab needs noopener.
    expect(await button.getAttribute('rel')).toContain('noopener');
  });

  test('sits on the reading-end side in each language', async ({ page }) => {
    test.skip(!(await configured()), 'no WhatsApp number set');

    // Right in English, LEFT in Arabic. Written first as a CSS property name
    // rather than a Tailwind class, which compiled to nothing and left it on
    // the right in both.
    await page.goto('/en');
    let box = (await page.getByTestId('whatsapp-button').boundingBox())!;
    let width = page.viewportSize()!.width;
    expect(width - (box.x + box.width), 'english: not near the right edge').toBeLessThan(60);

    await page.goto('/ar');
    box = (await page.getByTestId('whatsapp-button').boundingBox())!;
    width = page.viewportSize()!.width;
    expect(box.x, 'arabic: not near the left edge').toBeLessThan(60);
  });

  test('a product enquiry carries the product, not just the number', async ({ page }) => {
    test.skip(!(await configured()), 'no WhatsApp number set');

    await page.goto('/en/shop');
    await page.locator('a[href^="/en/products/"]').first().click();
    await page.waitForURL(/\/en\/products\//);

    const link = page.getByTestId('product-whatsapp');
    await expect(link).toBeVisible();

    const href = await link.getAttribute('href');
    const text = decodeURIComponent(new URL(href!).searchParams.get('text') ?? '');

    // Whoever answers has fifty near-identical packages.
    const title = (await page.locator('h1').innerText()).trim();
    expect(text).toContain(title);
    expect(text).toContain('/en/products/');
  });

  test('nothing renders when no number is configured', async ({ page }) => {
    // A dead chat button is worse than none, so it is absent rather than
    // disabled.
    const original = await withDb(async (db) => {
      const r = await db.query('select whatsapp_number from settings limit 1');
      return (r.rows[0]?.whatsapp_number as string | null) ?? null;
    });

    await withDb((db) => db.query('update settings set whatsapp_number = null'));
    try {
      await page.goto('/en');
      await expect(page.getByTestId('whatsapp-button')).toHaveCount(0);
    } finally {
      await withDb((db) =>
        db.query('update settings set whatsapp_number = $1', [original])
      );
    }
  });
});

test.describe('search and AI readiness', () => {
  test('the settings panel reports what still needs writing', async ({ browser }) => {
    /**
     * The tags and schema are generated and cannot be forgotten. The sentences
     * can, and a blank field looks identical to one that was never needed —
     * which is the gap this panel exists to close.
     */
    const context = await browser.newContext({ storageState: 'e2e/.auth/admin.json' });
    const page = await context.newPage();

    await page.goto('/admin/settings');
    await page.getByRole('tab', { name: /data|البيانات/i }).click().catch(() => {});
    // The tab control may render as a button; fall back to the text.
    if ((await page.getByTestId('seo-readiness').count()) === 0) {
      await page.getByText(/^(Data|البيانات)$/).first().click();
    }

    await expect(page.getByTestId('seo-readiness')).toBeVisible();
    await expect(page.getByTestId('seo-brandAnswer')).toBeVisible();
    await expect(page.getByTestId('seo-productText')).toBeVisible();

    await context.close();
  });
});
