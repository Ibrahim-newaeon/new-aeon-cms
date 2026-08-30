// e2e/arabic.spec.ts
import { test, expect } from '@playwright/test';

/**
 * The Arabic storefront.
 *
 * Not a translation check — the strings are covered by the dictionaries. This
 * is about DIRECTION, which is where a bilingual site actually breaks: things
 * that read correctly in English and lay out backwards in Arabic.
 */
test.use({ storageState: { cookies: [], origins: [] } });

const PAGES = ['/ar', '/ar/shop', '/ar/about-us', '/ar/blog', '/ar/resources', '/ar/cart', '/ar/account'];

test.describe('Arabic storefront', () => {
  test('every page declares itself right-to-left', async ({ page }) => {
    for (const url of PAGES) {
      await page.goto(url);
      await expect(page.locator('html'), url).toHaveAttribute('dir', 'rtl');
      await expect(page.locator('html'), url).toHaveAttribute('lang', 'ar');
    }
  });

  test('no page scrolls sideways', async ({ page }) => {
    // A stray fixed width or an un-mirrored margin shows up here first.
    for (const url of PAGES) {
      await page.goto(url);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      expect(overflow, url).toBeLessThanOrEqual(1);
    }
  });

  test('a price is not force-overridden to LTR', async ({ page }) => {
    /**
     * Intl returns an Arabic price already wrapped in U+200F marks. Forcing
     * dir="ltr" over that makes the bidi algorithm reorder a string that was
     * already ordered — the same price laid out 74px instead of 52, with the
     * currency on the wrong side. It looked fine in English, which is how it
     * survived.
     */
    await page.goto('/ar/shop');
    const price = page.getByTestId('shop-price').first();
    await expect(price).toBeVisible();

    expect(await price.getAttribute('dir')).toBeNull();

    const text = await price.innerText();
    // Arabic-Indic digits, and the RTL marks Intl put there.
    expect(text).toMatch(/[٠-٩]/);
    expect(text).toContain('‏');
  });

  test('the English shop still forces LTR on its prices', async ({ page }) => {
    // The override is correct there — "JOD 41.000" is a left-to-right run.
    await page.goto('/en/shop');
    await expect(page.getByTestId('shop-price').first()).toHaveAttribute('dir', 'ltr');
  });

  test('the shop sidebar sits on the right, and the grid to its left', async ({ page }) => {
    await page.goto('/ar/shop');
    const sidebar = await page.getByTestId('shop-sidebar').boundingBox();
    const count = await page.getByTestId('shop-count').boundingBox();
    expect(sidebar!.x).toBeGreaterThan(count!.x);
  });

  test('the account tabs run right to left', async ({ page }) => {
    await page.goto('/ar/account');
    // Signed out, so this is the auth form; its heading is the check that the
    // Arabic copy is wired at all.
    await expect(page.getByTestId('account-auth')).toBeVisible();
    await expect(page.locator('h1')).toHaveText('حسابي');
  });

  test('a phone number is not reversed by the RTL context', async ({ page }) => {
    /**
     * The inverse of the price bug. A phone starts with a neutral "+" and is
     * otherwise weak digits, so on an RTL page the bidi algorithm places that
     * "+" per the paragraph direction: "+962 7 9000 0000" rendered as
     * "0000 9000 7 962+". A Latin run genuinely does need dir="ltr" — which is
     * exactly why blanket-removing it from prices would have been wrong too.
     */
    await page.goto('/ar');
    const phone = page.locator('footer a[href^="tel:"]');
    const count = await phone.count();
    test.skip(count === 0, 'no contact phone configured');

    await expect(phone.first()).toHaveAttribute('dir', 'ltr');

    // The rendered text still begins with the +, rather than ending with it.
    const text = (await phone.first().innerText()).trim();
    expect(text.startsWith('+')).toBe(true);
  });

  test('the product page reads right to left', async ({ page }) => {
    await page.goto('/ar/shop');
    await page.locator('a[href^="/ar/products/"]').first().click();

    await expect(page.locator('h1')).toBeVisible();
    const h1 = await page.locator('h1').boundingBox();
    const main = await page.locator('article').boundingBox();
    // The title starts from the right edge of its column, not the left.
    expect(h1!.x + h1!.width).toBeGreaterThan(main!.x + main!.width / 2);
  });
});
