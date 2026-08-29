// e2e/forms.spec.ts
import { test, expect } from '@playwright/test';
import { ADMIN_PATH, withDb } from './fixtures';

/**
 * The messages/newsletter split.
 *
 * A contact message is a task — it arrives unread, gets handled, leaves the
 * queue. A newsletter signup is a list entry that gets exported. They shared
 * one undifferentiated list before, which served neither.
 */
test.describe('forms', () => {
  test.describe.configure({ mode: 'serial' });

  const marker = `e2e-forms-${Date.now()}`;

  test.beforeAll(async () => {
    await withDb(async (db) => {
      // A contact message and a newsletter signup that carries a spreadsheet
      // formula — the export must neutralise it.
      await db.query(
        `insert into form_submissions (type, payload, page_slug, locale)
         values ('contact', $1::jsonb, $2, 'ar'),
                ('newsletter', $3::jsonb, $2, 'en')`,
        [
          JSON.stringify({ name: marker, message: 'a question' }),
          marker,
          JSON.stringify({ email: `=HYPERLINK("http://evil.example","x")+${marker}@x.com` }),
        ]
      );
    });
  });

  test.afterAll(async () => {
    await withDb((db) => db.query('delete from form_submissions where page_slug = $1', [marker]));
  });

  test('messages and newsletter are separate lists', async ({ page }) => {
    await page.goto(`${ADMIN_PATH}/forms`);

    // The contact tab shows the message and not the signup.
    await expect(page.getByTestId('forms-tab-contact')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByText(marker).first()).toBeVisible();

    await page.getByTestId('forms-tab-newsletter').click();
    await page.waitForURL(/type=newsletter/);

    await expect(page.getByTestId('forms-tab-newsletter')).toHaveAttribute(
      'aria-selected',
      'true'
    );
    // The signup renders as an address, not as a field dump.
    await expect(page.getByText(`${marker}@x.com`, { exact: false }).first()).toBeVisible();
  });

  test('a message can be marked read and archived out of the inbox', async ({ page }) => {
    await page.goto(`${ADMIN_PATH}/forms`);

    const row = page.locator('[data-test-id^="form-row-"]').filter({ hasText: marker }).first();
    await expect(row).toBeVisible();
    const id = (await row.getAttribute('data-test-id'))!.replace('form-row-', '');

    await page.getByTestId(`form-read-${id}`).click();
    await expect
      .poll(async () => {
        const r = await withDb((db) =>
          db.query('select is_read from form_submissions where id = $1', [id])
        );
        return r.rows[0].is_read;
      })
      .toBe(true);

    await page.getByTestId(`form-archive-${id}`).click();

    // Archiving removes it from the inbox but keeps it readable.
    await expect(page.getByText(marker)).toHaveCount(0, { timeout: 15_000 });

    await page.goto(`${ADMIN_PATH}/forms?archived=1`);
    await expect(page.getByText(marker).first()).toBeVisible();
  });

  test('the newsletter export downloads a CSV with the formula neutralised', async ({ page }) => {
    await page.goto(`${ADMIN_PATH}/forms?type=newsletter`);

    const download = await Promise.race([
      page.waitForEvent('download'),
      page.getByTestId('forms-export').click().then(() => page.waitForEvent('download')),
    ]);

    expect(download.suggestedFilename()).toMatch(/^newsletter-\d{4}-\d{2}-\d{2}\.csv$/);

    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    const raw = Buffer.concat(chunks);

    // A UTF-8 BOM, or Excel reads the file as the local codepage and every
    // Arabic name becomes mojibake.
    expect(raw.subarray(0, 3)).toEqual(Buffer.from([0xef, 0xbb, 0xbf]));

    const text = raw.toString('utf8');
    expect(text).toContain('"email","page","locale","subscribed_at"');

    // The submitted value began with `=`, which Excel would execute. It must
    // arrive quoted as text.
    expect(text).toContain(`"'=HYPERLINK`);
    expect(text).not.toContain('"=HYPERLINK');
  });
});
