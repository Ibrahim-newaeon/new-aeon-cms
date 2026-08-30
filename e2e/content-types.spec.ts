// e2e/content-types.spec.ts
import { test, expect } from '@playwright/test';
import { ADMIN_PATH, withDb, uniqueSlug } from './fixtures';

/**
 * Creating a content type from the admin.
 *
 * The table always accepted rows; what it could not do was give one a URL,
 * because /[locale]/[slug] catches every bare path. The property under test is
 * that a type created here is actually reachable — and that one which could
 * never be reachable is refused up front rather than silently.
 */
test.describe('content types', () => {
  test.describe.configure({ mode: 'serial' });

  const slug = uniqueSlug('ct');
  const prefix = uniqueSlug('p');
  let typeId: string | undefined;

  test.afterAll(async () => {
    await withDb(async (db) => {
      await db.query(
        `delete from content where type_id in (select id from content_types where slug = $1)`,
        [slug]
      );
      await db.query('delete from content_types where slug = $1', [slug]);
    });
  });

  test('the admin refuses an address an existing route already owns', async ({ page }) => {
    /**
     * Next resolves static segments before dynamic ones, so a type at "shop"
     * would not break the store — it would simply never resolve, and the
     * editor would be left wondering where their pages went.
     */
    await page.goto(`${ADMIN_PATH}/content/types`);
    await page.getByTestId('type-new').click();
    await page.getByTestId('type-name').fill('Should not save');
    await page.getByTestId('type-slug').fill(uniqueSlug('bad'));
    await page.getByTestId('type-prefix').fill('shop');
    await page.getByTestId('type-save').click();

    await expect(page.getByTestId('type-error')).toContainText('shop');
  });

  test('a new type is created and given an address', async ({ page }) => {
    await page.goto(`${ADMIN_PATH}/content/types`);
    await page.getByTestId('type-new').click();
    await page.getByTestId('type-name').fill('E2E Type');
    await page.getByTestId('type-slug').fill(slug);
    await page.getByTestId('type-prefix').fill(prefix);
    await page.getByTestId('type-save').click();

    await expect(page.getByTestId('content-types')).toContainText(slug);

    typeId = await withDb(async (db) => {
      const r = await db.query('select id from content_types where slug = $1', [slug]);
      return r.rows[0]?.id as string | undefined;
    });
    expect(typeId).toBeTruthy();
  });

  test('its entries are reachable at that address', async ({ page }) => {
    test.skip(!typeId, 'type was not created');

    const entrySlug = uniqueSlug('entry');
    await withDb(async (db) => {
      const c = await db.query(
        `insert into content (type_id, slug, status, published_at)
         values ($1, $2, 'published', now()) returning id`,
        [typeId, entrySlug]
      );
      await db.query(
        `insert into content_i18n (content_id, locale, title)
         values ($1, 'en', 'E2E Entry'), ($1, 'ar', 'مدخل')`,
        [c.rows[0].id]
      );
    });

    // The archive, then the entry.
    await page.goto(`/en/${prefix}`);
    await expect(page.getByTestId('type-archive')).toContainText('E2E Entry');

    await page.goto(`/en/${prefix}/${entrySlug}`);
    await expect(page.getByTestId('type-entry')).toBeVisible();
    await expect(page.locator('h1')).toHaveText('E2E Entry');

    // And in Arabic, from the same rows.
    await page.goto(`/ar/${prefix}/${entrySlug}`);
    await expect(page.locator('h1')).toHaveText('مدخل');
  });

  test('a built-in type cannot be deleted', async ({ page }) => {
    // page/post/resource own hand-built screens; removing one would orphan them.
    await page.goto(`${ADMIN_PATH}/content/types`);
    await expect(page.getByTestId('type-delete-page')).toHaveCount(0);
    await expect(page.getByTestId('type-delete-post')).toHaveCount(0);
  });

  test('existing routes still resolve after the segment rename', async ({ page }) => {
    // /[locale]/[slug] became /[locale]/[segment] so one dynamic name could
    // serve both a page and a type archive. Nothing else may have moved.
    for (const url of ['/en/shop', '/en/search', '/en/blog']) {
      const res = await page.goto(url);
      expect(res?.status(), url).toBe(200);
    }
  });
});
