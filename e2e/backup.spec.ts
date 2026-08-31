// e2e/backup.spec.ts
import { test, expect } from '@playwright/test';
import { withDb } from './fixtures';

/**
 * The backup download.
 *
 * The unit test proves the allow-list is right. This proves the file that
 * comes out of the server matches it — a different question, and the one a
 * client's data actually depends on.
 *
 * Every request here is driven from inside the page rather than from a bare
 * request context. The route checks the origin before it checks the session,
 * so a context without browser headers gets 403 for being cross-site and never
 * reaches the auth check — which would make an access test pass while proving
 * nothing about access.
 */

/** Same-origin fetch from the page, returning status and body length. */
async function fetchBackup(page: import('@playwright/test').Page) {
  return page.evaluate(async () => {
    const res = await fetch('/api/backup', { credentials: 'same-origin' });
    const buf = res.ok ? await res.arrayBuffer() : new ArrayBuffer(0);
    return {
      status: res.status,
      type: res.headers.get('content-type') ?? '',
      disposition: res.headers.get('content-disposition') ?? '',
      bytes: buf.byteLength,
      signature: new TextDecoder('latin1').decode(new Uint8Array(buf.slice(0, 2))),
      /**
       * Entry names, read from the zip's local file headers.
       *
       * Parsed here rather than unzipped in Node because the archive is
       * streamed and never touches disk — and the names are all the assertion
       * needs. Each entry begins PK\x03\x04, with the name length at offset 26
       * and the name itself at offset 30.
       */
      names: (() => {
        const b = new Uint8Array(buf);
        const view = new DataView(buf);
        const out: string[] = [];
        for (let i = 0; i + 30 < b.length; i++) {
          if (b[i] === 0x50 && b[i + 1] === 0x4b && b[i + 2] === 0x03 && b[i + 3] === 0x04) {
            const nameLen = view.getUint16(i + 26, true);
            if (nameLen > 0 && nameLen < 512 && i + 30 + nameLen <= b.length) {
              out.push(new TextDecoder().decode(b.slice(i + 30, i + 30 + nameLen)));
            }
          }
        }
        return out;
      })(),
    };
  });
}
test.describe('backup', () => {
  test('an admin can download an archive containing the data and the media', async ({ page }) => {
    await page.goto('/admin/settings');

    const res = await fetchBackup(page);
    expect(res.status).toBe(200);
    expect(res.type).toContain('application/zip');
    expect(res.disposition).toContain('attachment');

    /**
     * A real archive, judged by what is IN it rather than by its size.
     *
     * This asserted > 100kB on the reasoning that "media alone is megabytes" —
     * true of a shop with a full uploads folder, false of a fresh install,
     * where the whole archive is the seed placeholder and some JSON. Size was
     * standing in for completeness; the entry names are the actual claim.
     */
    expect(res.signature).toBe('PK');
    expect(res.bytes).toBeGreaterThan(1_000);
    for (const entry of ['manifest.json', 'README', 'data/']) {
      expect(res.names.some((n) => n.includes(entry)), `archive has no ${entry}`).toBe(true);
    }
  });

  test('the download is recorded, because it contains every customer', async ({ page }) => {
    const before = await withDb(async (db) => {
      const r = await db.query(`select count(*)::int as n from audit_log where action = 'backup.download'`);
      return r.rows[0].n as number;
    });

    await page.goto('/admin/settings');
    await fetchBackup(page);

    const after = await withDb(async (db) => {
      const r = await db.query(`select count(*)::int as n from audit_log where action = 'backup.download'`);
      return r.rows[0].n as number;
    });

    // "Who took a copy of the database" has to be answerable.
    expect(after).toBe(before + 1);
  });
});

test.describe('backup access', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('a signed-out visitor cannot download it', async ({ page }) => {
    // From a real page, so this is the AUTH check refusing rather than the
    // cross-site check, which would refuse anyone including an admin.
    await page.goto('/en');
    const res = await fetchBackup(page);
    expect(res.status).toBe(401);
    expect(res.bytes).toBe(0);
  });
});
