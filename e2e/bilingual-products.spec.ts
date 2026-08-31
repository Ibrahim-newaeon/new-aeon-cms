// e2e/bilingual-products.spec.ts
import { test, expect } from '@playwright/test';
import { withDb } from './fixtures';

/**
 * A product live in only one language is not live at all.
 *
 * The storefront's name lookup falls back to the other locale, so a
 * half-translated product did NOT look broken on the English site: it appeared,
 * priced and buyable, wearing an Arabic name. Nothing on screen signalled it,
 * which is why this is enforced and tested rather than left to review.
 *
 * Everything here drives the real storefront, because the rule has to hold on
 * the grid, the product page, the facet counts, the search and the sitemap —
 * five call sites that historically drifted apart.
 */
test.use({
  storageState: { cookies: [], origins: [] },
  extraHTTPHeaders: { 'x-forwarded-for': '203.0.113.72' },
});

const SLUG = 'e2e-half-translated';
let productId: string | null = null;

test.beforeAll(async () => {
  productId = await withDb(async (db) => {
    const p = await db.query(
      `insert into products (slug, base_price, is_active) values ($1, 42000, true) returning id`,
      [SLUG]
    );
    const id = p.rows[0].id as string;
    // Arabic only — deliberately the exact shape found in the real catalogue.
    await db.query(`insert into product_i18n (product_id, locale, name) values ($1, 'ar', $2)`, [
      id,
      'منتج اختبار بلا ترجمة',
    ]);
    await db.query(
      `insert into product_variants (product_id, sku, price, stock, is_active)
       values ($1, $2, 42000, 10, true)`,
      [id, 'E2E-HALF-1']
    );
    return id;
  });
});

test.afterAll(async () => {
  if (!productId) return;
  await withDb(async (db) => {
    await db.query('delete from product_variants where product_id = $1', [productId]);
    await db.query('delete from products where id = $1', [productId]);
  });
});

for (const locale of ['en', 'ar']) {
  test(`it is absent from the ${locale} shop grid`, async ({ page }) => {
    // Absent in ARABIC too, which is the part that is easy to get wrong: it
    // HAS an Arabic name, so a naive per-locale check would leave it live for
    // half the audience and produce two different catalogues.
    await page.goto(`/${locale}/shop`);
    await expect(page.locator(`a[href*="${SLUG}"]`)).toHaveCount(0);
  });

  test(`its ${locale} page 404s rather than rendering half-translated`, async ({ page }) => {
    const res = await page.goto(`/${locale}/products/${SLUG}`);
    expect(res?.status()).toBe(404);
  });
}

test('the product count matches the grid', async ({ page }) => {
  // The facet count and the grid must share one definition of live. A bar
  // reading "52 products" over a grid of 51 is worse than no count.
  await page.goto('/en/shop');
  const text = (await page.locator('body').innerText()).match(/(\d+)\s+products/i);
  expect(text, 'no product count on the page').not.toBeNull();

  const counted = Number(text![1]);
  const cards = await page.locator('a[href*="/products/"]').count();
  expect(cards).toBeGreaterThan(0);
  expect(counted).toBe(cards);
});

test('it is not in the sitemap', async ({ page }) => {
  // The sitemap lists both languages as alternates for every URL, so offering
  // one that 404s in either is a promise it cannot keep.
  const res = await page.goto('/sitemap.xml');
  expect((await res!.text()).includes(SLUG)).toBe(false);
});

test('search does not surface it', async ({ page }) => {
  await page.goto('/ar/search?q=' + encodeURIComponent('منتج اختبار'));
  await expect(page.locator(`a[href*="${SLUG}"]`)).toHaveCount(0);
});
