// e2e/media-folders.spec.ts
import { test, expect } from '@playwright/test';
import { ADMIN_PATH, withDb } from './fixtures';

/**
 * Media folders.
 *
 * The property that matters most is the one a "delete folder" button normally
 * violates: deleting a folder must never be a way to lose files.
 */
test.describe('media folders', () => {
  test.describe.configure({ mode: 'serial' });

  const stamp = Date.now();
  const parentName = `e2e-parent-${stamp}`;
  const childName = `e2e-child-${stamp}`;
  const assetUrl = `/uploads/e2e-folders/${stamp}.png`;

  let parentId: string;
  let childId: string;
  let assetId: string;

  test.beforeAll(async () => {
    await withDb(async (db) => {
      const asset = await db.query(
        `insert into media_assets (filename, original_name, mime_type, size, url)
         values ('f.png', $1, 'image/png', 10, $2) returning id`,
        [`${parentName}.png`, assetUrl]
      );
      assetId = asset.rows[0].id;
    });
  });

  test.afterAll(async () => {
    await withDb(async (db) => {
      await db.query(`delete from media_assets where url = $1`, [assetUrl]);
      await db.query(`delete from media_folders where name like 'e2e-%'`);
    });
  });

  test('a folder can be created, and nesting stops at one level', async ({ page, baseURL }) => {
    await page.goto(`${ADMIN_PATH}/media`);
    await expect(page.getByTestId('media-folders')).toBeVisible();

    const create = (body: unknown) =>
      page.evaluate(
        async ({ url, payload }) => {
          const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify(payload),
          });
          return { status: res.status, body: await res.json() };
        },
        { url: `${baseURL}/api/media/folders`, payload: body }
      );

    const parent = await create({ name: parentName });
    expect(parent.status).toBe(200);
    parentId = parent.body.data.id;

    const child = await create({ name: childName, parentId });
    expect(child.status).toBe(200);
    childId = child.body.data.id;
    // The breadcrumb is denormalised for display.
    expect(child.body.data.path).toBe(`${parentName} / ${childName}`);

    // A third level is refused: arbitrary depth means recursive queries and a
    // move UI nobody enjoys, for a library that is a flat grid.
    const tooDeep = await create({ name: `e2e-deep-${stamp}`, parentId: childId });
    expect(tooDeep.status).toBe(400);
  });

  test('an asset can be moved into a folder and the grid filters by it', async ({ page }) => {
    await page.goto(`${ADMIN_PATH}/media`);

    await page.getByTestId(`asset-folder-${assetId}`).selectOption(childId);

    await expect
      .poll(async () => {
        const r = await withDb((db) =>
          db.query(`select folder_id from media_assets where id = $1`, [assetId])
        );
        return r.rows[0].folder_id;
      })
      .toBe(childId);

    // Selecting the folder narrows the grid to it.
    await page.goto(`${ADMIN_PATH}/media?folder=${childId}`);
    await expect(page.getByText(`${parentName}.png`)).toBeVisible();

    // ...and the other folder is empty.
    await page.goto(`${ADMIN_PATH}/media?folder=${parentId}`);
    await expect(page.getByText(`${parentName}.png`)).toHaveCount(0);
  });

  test('renaming a parent rewrites its children’s breadcrumb', async ({ page, baseURL }) => {
    const renamed = `${parentName}-renamed`;

    await page.goto(`${ADMIN_PATH}/media`);
    await page.evaluate(
      async ({ url, name }) => {
        await fetch(url, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ name }),
        });
      },
      { url: `${baseURL}/api/media/folders/${parentId}`, name: renamed }
    );

    const rows = await withDb((db) =>
      db.query(`select path from media_folders where id = $1`, [childId])
    );
    // A path that disagrees with parent_id is how this kind of column rots.
    expect(rows.rows[0].path).toBe(`${renamed} / ${childName}`);
  });

  test('deleting a folder keeps its files and promotes its children', async ({
    page,
    baseURL,
  }) => {
    await page.goto(`${ADMIN_PATH}/media`);

    // Delete the PARENT while the child holds the asset.
    const result = await page.evaluate(
      async (url) => {
        const res = await fetch(url, { method: 'DELETE', credentials: 'same-origin' });
        return { status: res.status, body: await res.json() };
      },
      `${baseURL}/api/media/folders/${parentId}`
    );
    expect(result.status).toBe(200);

    const child = await withDb((db) =>
      db.query(`select parent_id, path from media_folders where id = $1`, [childId])
    );
    expect(child.rows[0].parent_id).toBeNull();
    expect(child.rows[0].path).toBe(childName);

    // Now delete the folder actually holding the asset.
    const second = await page.evaluate(
      async (url) => {
        const res = await fetch(url, { method: 'DELETE', credentials: 'same-origin' });
        return await res.json();
      },
      `${baseURL}/api/media/folders/${childId}`
    );
    expect(second.data.movedAssets).toBe(1);

    // The file is still there, at the root.
    const asset = await withDb((db) =>
      db.query(`select folder_id from media_assets where id = $1`, [assetId])
    );
    expect(asset.rows).toHaveLength(1);
    expect(asset.rows[0].folder_id).toBeNull();
  });
});
