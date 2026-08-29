// e2e/content-authoring.spec.ts
import { test, expect } from '@playwright/test';
import { ADMIN_PATH, uniqueSlug, withDb } from './fixtures';

/**
 * Admin → database → public site.
 *
 * The most valuable path in the suite: it is the only one that proves the three
 * halves of the CMS actually meet. A unit test can show the form validates and
 * the renderer renders; only this shows that what an editor typed reaches a
 * reader.
 */
test.describe('content authoring', () => {
  const created: string[] = [];

  test.afterAll(async () => {
    // Each run creates a page; without this the pages list grows forever and
    // the seeded corpus stops resembling a real one.
    if (created.length === 0) return;
    await withDb(async (db) => {
      await db.query(`delete from content where slug = any($1::text[])`, [created]);
    });
  });

  test('a draft is not reachable by guessing its URL', async ({ page, context }) => {
    const slug = uniqueSlug('e2e-draft');
    created.push(slug);

    await page.goto(`${ADMIN_PATH}/content/pages/new`);
    await expect(page.getByTestId('page-form')).toBeVisible();

    await page.getByTestId('page-slug').fill(slug);
    await page.getByTestId('page-title').fill('مسودة اختبار');
    await page.getByTestId('page-status').selectOption('draft');
    await page.getByTestId('page-save').click();

    await page.waitForURL((u) => !u.pathname.endsWith('/new'), { timeout: 20_000 });

    // A reader with no session must get a 404, not the draft.
    const anon = await context.browser()!.newContext();
    const reader = await anon.newPage();
    const response = await reader.goto(`/ar/${slug}`);
    expect(response?.status()).toBe(404);
    await anon.close();
  });

  test('a published page reaches the public site', async ({ page, context }) => {
    const slug = uniqueSlug('e2e-page');
    const title = `صفحة اختبار ${slug}`;
    created.push(slug);

    await page.goto(`${ADMIN_PATH}/content/pages/new`);
    await page.getByTestId('page-slug').fill(slug);
    await page.getByTestId('page-title').fill(title);
    await page.getByTestId('page-status').selectOption('published');
    await page.getByTestId('page-save').click();

    await page.waitForURL((u) => !u.pathname.endsWith('/new'), { timeout: 20_000 });

    const anon = await context.browser()!.newContext();
    const reader = await anon.newPage();
    const response = await reader.goto(`/ar/${slug}`);

    expect(response?.status()).toBe(200);
    await expect(reader.getByRole('heading', { name: title })).toBeVisible();
    await anon.close();
  });

  test('the pages list shows a newly created page and can search for it', async ({ page }) => {
    const slug = uniqueSlug('e2e-search');
    created.push(slug);

    await page.goto(`${ADMIN_PATH}/content/pages/new`);
    await page.getByTestId('page-slug').fill(slug);
    await page.getByTestId('page-title').fill('عنوان قابل للبحث');
    await page.getByTestId('page-status').selectOption('published');
    await page.getByTestId('page-save').click();
    await page.waitForURL((u) => !u.pathname.endsWith('/new'), { timeout: 20_000 });

    await page.goto(`${ADMIN_PATH}/content/pages`);
    await page.getByTestId('data-table-search').fill(slug);

    await expect(page.getByText(slug, { exact: false }).first()).toBeVisible();
  });

  test('a tag created in the admin renders per-locale on its archive', async ({
    page,
    context,
  }) => {
    const slug = uniqueSlug('e2e-tag');

    await page.goto(`${ADMIN_PATH}/content/tags`);
    await expect(page.getByTestId('tags-manager')).toBeVisible();

    await page.getByTestId('tag-name').fill('Reference Name');
    await page.getByTestId('tag-slug').fill(slug);
    await page.getByTestId('tag-name-ar').fill('اسم عربي');
    await page.getByTestId('tag-name-en').fill('English Name');
    await page.getByTestId('tag-create').click();

    await expect(page.getByText(slug, { exact: false }).first()).toBeVisible({ timeout: 15_000 });

    const anon = await context.browser()!.newContext();
    const reader = await anon.newPage();

    await reader.goto(`/ar/tag/${slug}`);
    await expect(reader.getByRole('heading', { level: 1 })).toHaveText('اسم عربي');

    await reader.goto(`/en/tag/${slug}`);
    await expect(reader.getByRole('heading', { level: 1 })).toHaveText('English Name');

    await anon.close();

    await withDb(async (db) => {
      await db.query(`delete from tags where slug = $1`, [slug]);
    });
  });
});
