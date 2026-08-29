// e2e/reviews.spec.ts
import { test, expect } from '@playwright/test';
import { ADMIN_PATH, PRODUCT_SLUG, SHOP_LOCALE, withDb } from './fixtures';

/**
 * Moderated product reviews.
 *
 * The property under test is that nothing a stranger writes reaches a product
 * page until a human approves it. An unmoderated public write endpoint on a
 * storefront is a spam target.
 */
test.describe('product reviews', () => {
  test.describe.configure({ mode: 'serial' });

  const stamp = Date.now();
  const bodyText = `e2e-review-${stamp} a genuinely lovely product`;
  const phone = '0799' + String(stamp).slice(-6);

  let productId: string;

  test.beforeAll(async () => {
    const rows = await withDb((db) =>
      db.query(`select id from products where slug = $1`, [PRODUCT_SLUG])
    );
    productId = rows.rows[0].id;

    await withDb((db) => db.query(`delete from product_reviews where phone = $1`, [phone]));
  });

  test.afterAll(async () => {
    await withDb((db) => db.query(`delete from product_reviews where phone = $1`, [phone]));
  });

  test('a shopper can submit a review, and it is NOT published immediately', async ({ page }) => {
    await page.context().clearCookies();
    await page.goto(`/${SHOP_LOCALE}/products/${PRODUCT_SLUG}`);

    await expect(page.getByTestId('product-reviews')).toBeVisible();
    await page.getByTestId('review-open').click();

    await page.getByTestId('review-name').fill('E2E Reviewer');
    await page.getByTestId('review-phone').fill(phone);
    await page.getByTestId('review-star-4').click();
    await page.getByTestId('review-body').fill(bodyText);
    await page.getByTestId('review-submit').click();

    // The wording says "will appear once checked", never "published".
    await expect(page.getByTestId('review-thanks')).toBeVisible({ timeout: 15_000 });

    const stored = await withDb((db) =>
      db.query(`select status, rating from product_reviews where phone = $1`, [phone])
    );
    expect(stored.rows[0].status).toBe('pending');
    expect(stored.rows[0].rating).toBe(4);

    // A fresh visitor must not see it.
    await page.goto(`/${SHOP_LOCALE}/products/${PRODUCT_SLUG}`);
    await expect(page.getByText(bodyText)).toHaveCount(0);
  });

  test('the same person cannot review the same product twice', async ({ page, baseURL }) => {
    await page.goto(`/${SHOP_LOCALE}/products/${PRODUCT_SLUG}`);

    // Deliberately a different phone FORMAT for the same number — the rule is
    // keyed on the normalised value, the same one that merges customers.
    const result = await page.evaluate(
      async ({ url, payload }) => {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify(payload),
        });
        return { status: res.status, body: await res.json() };
      },
      {
        url: `${baseURL}/api/commerce/reviews`,
        payload: {
          productId,
          name: 'Same Person',
          phone: `+962 ${phone.slice(1, 3)} ${phone.slice(3)}`,
          rating: 1,
          body: 'Trying to post a second review for the same product.',
        },
      }
    );

    expect(result.status).toBe(409);
  });

  test('approving it publishes the review and its rating', async ({ page }) => {
    await page.goto(`${ADMIN_PATH}/commerce/reviews`);
    await expect(page.getByTestId('reviews-manager')).toBeVisible();

    const id = (await withDb((db) =>
      db.query(`select id from product_reviews where phone = $1`, [phone])
    )).rows[0].id;

    await expect(page.getByTestId(`review-${id}`)).toBeVisible();
    await page.getByTestId(`review-approve-${id}`).click();

    await expect
      .poll(async () => {
        const r = await withDb((db) =>
          db.query(`select status from product_reviews where id = $1`, [id])
        );
        return r.rows[0].status;
      })
      .toBe('approved');

    // Who approved it is recorded.
    const moderator = await withDb((db) =>
      db.query(`select moderated_by from product_reviews where id = $1`, [id])
    );
    expect(moderator.rows[0].moderated_by).not.toBeNull();

    await page.goto(`/${SHOP_LOCALE}/products/${PRODUCT_SLUG}`);
    await expect(page.getByText(bodyText)).toBeVisible();
    await expect(page.getByTestId('review-summary')).toBeVisible();
  });

  test('rejecting it takes the review back off the page', async ({ page }) => {
    const id = (await withDb((db) =>
      db.query(`select id from product_reviews where phone = $1`, [phone])
    )).rows[0].id;

    await page.goto(`${ADMIN_PATH}/commerce/reviews?status=approved`);
    await page.getByTestId(`review-reject-${id}`).click();

    await expect
      .poll(async () => {
        const r = await withDb((db) =>
          db.query(`select status from product_reviews where id = $1`, [id])
        );
        return r.rows[0].status;
      })
      .toBe('rejected');

    await page.goto(`/${SHOP_LOCALE}/products/${PRODUCT_SLUG}`);
    await expect(page.getByText(bodyText)).toHaveCount(0);
  });
});
