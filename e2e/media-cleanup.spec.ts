// e2e/media-cleanup.spec.ts
import { test, expect } from '@playwright/test';
import { ADMIN_PATH, withDb } from './fixtures';

/**
 * Finding and removing uploads nothing points at.
 *
 * The one error this feature must never make is reporting a USED asset as
 * unused, so most of what follows is about reference sources being detected
 * rather than about the deleting.
 */
test.describe('media cleanup', () => {
  test.describe.configure({ mode: 'serial' });

  const orphanUrl = `/uploads/e2e/orphan-${Date.now()}.png`;
  const usedUrl = `/uploads/e2e/used-${Date.now()}.png`;

  async function unusedCount(): Promise<number> {
    const rows = await withDb((db) =>
      db.query(`select count(*)::int as n from media_assets where url like '/uploads/e2e/%'`)
    );
    return rows.rows[0].n;
  }

  test.beforeAll(async () => {
    await withDb(async (db) => {
      await db.query(
        `insert into media_assets (filename, original_name, mime_type, size, url)
         values ('o.png','e2e-orphan.png','image/png',10,$1),
                ('u.png','e2e-used.png','image/png',10,$2)`,
        [orphanUrl, usedUrl]
      );
      // One of them is referenced by settings, so it must never be offered up.
      await db.query(`update settings set favicon = $1 where id = 1`, [usedUrl]);
    });
  });

  test.afterAll(async () => {
    await withDb(async (db) => {
      await db.query(`update settings set favicon = null where id = 1`);
      await db.query(`delete from media_assets where url like '/uploads/e2e/%'`);
    });
  });

  test('the library offers an unused filter with a count', async ({ page }) => {
    await page.goto(`${ADMIN_PATH}/media`);

    const filter = page.getByTestId('media-filter-unused');
    await expect(filter).toBeVisible();
    // At least the orphan we just inserted.
    await expect(filter).toContainText(/\d/);
  });

  test('the unused view lists the orphan and excludes the referenced file', async ({ page }) => {
    await page.goto(`${ADMIN_PATH}/media?filter=unused`);

    const body = page.locator('body');
    await expect(body).toContainText('e2e-orphan.png');
    // Referenced by settings.favicon — listing it here would mean the cleanup
    // could delete a live image.
    await expect(body).not.toContainText('e2e-used.png');
  });

  test('cleanup deletes only what is still unused when the call arrives', async ({
    page,
    baseURL,
  }) => {
    expect(await unusedCount()).toBe(2);

    await page.goto(`${ADMIN_PATH}/media`);

    const ids = await withDb((db) =>
      db.query(`select id, url from media_assets where url like '/uploads/e2e/%' order by url`)
    );
    const allIds = ids.rows.map((r) => r.id);

    // Submitting BOTH ids, including the referenced one, is exactly the race
    // the server guards against: the browser's list is a snapshot.
    const result = await page.evaluate(
      async ({ url, body }) => {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify(body),
        });
        return { status: res.status, body: await res.json() };
      },
      { url: `${baseURL}/api/media/cleanup`, body: { ids: allIds } }
    );

    expect(result.status).toBe(200);
    expect(result.body.data.deleted).toBe(1);
    expect(result.body.data.skipped).toBe(1);

    // The referenced one survived.
    const left = await withDb((db) =>
      db.query(`select url from media_assets where url like '/uploads/e2e/%'`)
    );
    expect(left.rows).toHaveLength(1);
    expect(left.rows[0].url).toBe(usedUrl);
  });
});
