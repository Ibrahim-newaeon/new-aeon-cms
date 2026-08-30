// e2e/shop-filters.spec.ts
import { test, expect } from '@playwright/test';
import { SHOP_LOCALE, withDb } from './fixtures';

/**
 * The Shop filter bar.
 *
 * The promises worth holding: the URL is the state (so the back button works),
 * the count agrees with the grid, and a control that cannot narrow anything is
 * not shown at all.
 */
test.use({ storageState: { cookies: [], origins: [] } });

const shop = `/${SHOP_LOCALE}/shop`;

/** Product cards, counted by their links. */
const cards = (page: import('@playwright/test').Page) =>
  page.locator(`a[href^="/${SHOP_LOCALE}/products/"]`);

async function countLabel(page: import('@playwright/test').Page): Promise<number> {
  const text = await page.getByTestId('shop-count').innerText();
  return Number(text.replace(/\D+/g, ''));
}

test.describe('shop filters', () => {
  test('the count matches the number of products on the grid', async ({ page }) => {
    // These come from different queries. When they disagree the shopper is
    // told "52 products" over a grid of 50, which is worse than no count.
    await page.goto(shop);
    expect(await countLabel(page)).toBe(await cards(page).count());
  });

  test('a category narrows the grid and the count follows', async ({ page }) => {
    await page.goto(shop);
    const all = await cards(page).count();

    const firstCategory = page.getByTestId('shop-sidebar').locator('a[href*="/shop/"]').first();
    const href = await firstCategory.getAttribute('href');
    await firstCategory.click();
    await page.waitForURL(`**${href}`);

    const narrowed = await cards(page).count();
    expect(narrowed).toBeLessThan(all);
    expect(await countLabel(page)).toBe(narrowed);
  });

  test('the category goes in the path, never in the query string', async ({ page }) => {
    // /shop/perfumes is already indexable; ?category= would give the same
    // products a second address.
    await page.goto(shop);
    const href = await page
      .getByTestId('shop-sidebar')
      .locator('a[href*="/shop/"]')
      .first()
      .getAttribute('href');

    expect(href).toMatch(new RegExp(`^/${SHOP_LOCALE}/shop/[a-z0-9-]+$`));
    expect(href).not.toContain('category=');
  });

  test('filtering is a real navigation, so Back undoes it', async ({ page }) => {
    await page.goto(shop);
    const all = await cards(page).count();

    await page.getByTestId('shop-sidebar').locator('a[href*="/shop/"]').first().click();
    await expect(page).toHaveURL(/\/shop\/[a-z0-9-]+$/);

    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`${shop}$`));
    expect(await cards(page).count()).toBe(all);
  });

  test('a price range filters, and a chip clears it', async ({ page }) => {
    await page.goto(shop);
    const all = await cards(page).count();

    await page.getByTestId('shop-min').fill('100');
    await page.getByTestId('shop-price-apply').click();
    await page.waitForURL(/min=100/);

    const narrowed = await cards(page).count();
    expect(narrowed).toBeLessThan(all);
    expect(await countLabel(page)).toBe(narrowed);

    await page.getByTestId('shop-chip-price').click();
    await expect(page).toHaveURL(new RegExp(`${shop}$`));
    expect(await cards(page).count()).toBe(all);
  });

  test('sorting by price ascending really does ascend', async ({ page }) => {
    await page.goto(`${shop}?sort=price-asc`);
    const prices = await page.locator('[data-test-id="shop-price"]').allInnerTexts();
    const numbers = prices.map((p) => Number(p.replace(/[^\d.]/g, '')));
    expect(numbers.length).toBeGreaterThan(1);
    expect([...numbers]).toEqual([...numbers].sort((a, b) => a - b));
  });

  test('a control that cannot narrow anything is not rendered', async ({ page }) => {
    // Every variant in this catalogue is in stock, so an "in stock" toggle
    // would keep all of them — as useless as one that keeps none, and it
    // teaches the shopper the filters do not work.
    const { inStock, total } = await withDb(async (db) => {
      const r = await db.query(
        `select count(*)::int as total,
                count(*) filter (where exists (
                  select 1 from product_variants v
                  where v.product_id = p.id and v.is_active and v.stock > 0
                ))::int as in_stock
         from products p where p.is_active`
      );
      return { total: r.rows[0].total as number, inStock: r.rows[0].in_stock as number };
    });

    await page.goto(shop);
    const toggle = page.getByTestId('shop-sidebar').getByText(/in stock only/i);

    if (inStock === total) await expect(toggle).toHaveCount(0);
    else await expect(toggle).toHaveCount(1);
  });

  test('clearing everything returns the full grid', async ({ page }) => {
    await page.goto(`${shop}?sale=1&min=100`);
    expect(await cards(page).count()).toBeGreaterThan(0);

    await page.getByTestId('shop-clear-all').first().click();
    await expect(page).toHaveURL(new RegExp(`${shop}$`));
    await expect(page.getByTestId('shop-chips')).toHaveCount(0);
  });

  test('an empty result offers a way out instead of a blank shop', async ({ page }) => {
    await page.goto(`${shop}?min=999999`);
    await expect(cards(page)).toHaveCount(0);
    await expect(page.getByTestId('shop-clear-all').first()).toBeVisible();
  });

  test('the Arabic shop puts the sidebar on the right', async ({ page }) => {
    await page.goto('/ar/shop');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');

    const sidebar = await page.getByTestId('shop-sidebar').boundingBox();
    const grid = await page.getByTestId('shop-count').boundingBox();
    expect(sidebar).not.toBeNull();
    expect(grid).not.toBeNull();
    // Start side in RTL is the right side of the viewport.
    expect(sidebar!.x).toBeGreaterThan(grid!.x);
  });
});
