// e2e/admin-locale.spec.ts
import { test, expect } from '@playwright/test';
import { STORAGE_STATE, ADMIN_PATH, withDb } from './fixtures';
import { ADMIN_LOCALE_COOKIE } from '../lib/admin-i18n';

/**
 * The admin's language applies to the DATA, not just the chrome.
 *
 * Every list here was pinned to Arabic while the surrounding labels followed
 * the staff member's choice — so an English admin read English headings above a
 * table of Arabic titles and had no way to tell which page was which.
 *
 * Asserted against the rendered table rather than the query, because the bug
 * was in the wiring between the two: the query already took a locale, and the
 * route simply never passed it.
 */
test.use({ storageState: STORAGE_STATE });

async function useAdminLanguage(page: import('@playwright/test').Page, value: 'ar' | 'en') {
  await page.context().addCookies([
    { name: ADMIN_LOCALE_COOKIE, value, url: 'http://127.0.0.1:3000' },
  ]);
}

test('page titles follow the admin language', async ({ page }) => {
  // A page that exists in both languages, so the two runs differ only by locale.
  const titles = await withDb(async (db) => {
    const r = await db.query(
      `select i.locale::text as locale, i.title
       from content c join content_i18n i on i.content_id = c.id
       where c.slug = 'about-us'`
    );
    return Object.fromEntries(r.rows.map((x) => [x.locale as string, x.title as string]));
  });
  expect(titles.ar && titles.en, 'about-us needs both languages for this test').toBeTruthy();
  expect(titles.ar).not.toBe(titles.en);

  await useAdminLanguage(page, 'en');
  await page.goto(`${ADMIN_PATH}/content/pages`);
  await expect(page.getByText(titles.en!, { exact: true }).first()).toBeVisible();

  await useAdminLanguage(page, 'ar');
  await page.goto(`${ADMIN_PATH}/content/pages`);
  await expect(page.getByText(titles.ar!, { exact: true }).first()).toBeVisible();
});

test('product names follow the admin language', async ({ page }) => {
  const names = await withDb(async (db) => {
    const r = await db.query(
      `select i.locale::text as locale, i.name
       from products p join product_i18n i on i.product_id = p.id
       where p.slug = 'jm-pkg-01'`
    );
    return Object.fromEntries(r.rows.map((x) => [x.locale as string, x.name as string]));
  });
  test.skip(!(names.ar && names.en), 'jm-pkg-01 is not translated both ways');

  await useAdminLanguage(page, 'en');
  await page.goto(`${ADMIN_PATH}/commerce/products`);
  await expect(page.getByText(names.en!, { exact: true }).first()).toBeVisible();
});

test('a row with no title in this language is never blank', async ({ page }) => {
  /**
   * The trap in the obvious fix. The lists used to LEFT JOIN on the locale, so
   * simply passing the admin's language through would have turned every
   * untranslated row into an empty line — an item staff can see exists but
   * cannot identify, on exactly the records that need attention.
   */
  const slug = `e2e-ar-only-${Date.now()}`;
  const id = await withDb(async (db) => {
    const type = await db.query(`select id from content_types where slug = 'page' limit 1`);
    const admin = await db.query(`select id from users where role = 'admin' limit 1`);
    const c = await db.query(
      `insert into content (type_id, slug, author_id, status) values ($1, $2, $3, 'draft') returning id`,
      [type.rows[0].id, slug, admin.rows[0].id]
    );
    await db.query(`insert into content_i18n (content_id, locale, title) values ($1, 'ar', $2)`, [
      c.rows[0].id,
      'صفحة بالعربية فقط',
    ]);
    return c.rows[0].id as string;
  });

  try {
    await useAdminLanguage(page, 'en');
    await page.goto(`${ADMIN_PATH}/content/pages`);

    // The ROW, not the link: the row's action links are icon-only, so reading
    // their text proves nothing about the title cell beside them.
    const row = page.locator('tr').filter({ has: page.locator(`a[href*="${id}"]`) }).first();
    await expect(row).toBeVisible();

    // Falls back to the Arabic title rather than rendering an empty cell.
    await expect(row).toContainText('صفحة بالعربية فقط');
  } finally {
    await withDb(async (db) => {
      await db.query('delete from content where id = $1', [id]);
    });
  }
});
