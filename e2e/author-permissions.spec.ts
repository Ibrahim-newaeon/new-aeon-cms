// e2e/author-permissions.spec.ts
import { test, expect } from '@playwright/test';
import { withDb, uniqueSlug } from './fixtures';
import { hashPassword } from '../lib/auth/password';

/**
 * The author role, which until now was a label rather than a permission.
 *
 * An author could publish without review, credit a post to a colleague, and
 * edit or unpublish anyone's live pages. All three were reachable with an
 * ordinary session, so all three are attempted here rather than assumed fixed.
 */
test.use({ storageState: { cookies: [], origins: [] } });

const PASSWORD = 'author-password-123';

test.describe('author permissions', () => {
  test.describe.configure({ mode: 'serial' });

  const email = `author-${Date.now()}@example.test`;
  let authorId: string;
  let editorsContentId: string;
  let origin: string;

  test.beforeAll(async () => {
    origin = new URL(test.info().project.use.baseURL!).origin;

    authorId = await withDb(async (db) => {
      const r = await db.query(
        `insert into users (email, password_hash, name, role, is_active)
         values ($1, $2, 'E2E Author', 'author', true) returning id`,
        [email, await hashPassword(PASSWORD)]
      );
      return r.rows[0].id as string;
    });

    // A published page belonging to somebody else.
    editorsContentId = await withDb(async (db) => {
      const type = await db.query(`select id from content_types where slug='page' limit 1`);
      const c = await db.query(
        `insert into content (type_id, slug, status, published_at)
         values ($1, $2, 'published', now()) returning id`,
        [type.rows[0].id, uniqueSlug('editors-page')]
      );
      const id = c.rows[0].id as string;
      await db.query(
        `insert into content_i18n (content_id, locale, title) values ($1,'en','Editor page'),($1,'ar','صفحة')`,
        [id]
      );
      return id;
    });
  });

  test.afterAll(async () => {
    await withDb(async (db) => {
      await db.query('delete from content where author_id = $1', [authorId]);
      await db.query('delete from content where id = $1', [editorsContentId]);
      // The audit log references the user, deliberately — a record of who did
      // what should outlive the account. Teardown clears this run's rows
      // rather than the constraint being loosened to suit a test.
      await db.query('delete from audit_log where user_id = $1', [authorId]);
      await db.query('delete from refresh_tokens where user_id = $1', [authorId]);
      await db.query('delete from users where id = $1', [authorId]);
    });
  });

  /** Signs in as the author and returns a request context carrying the cookie. */
  async function asAuthor(page: import('@playwright/test').Page) {
    await page.goto('/admin/login');
    const status = await page.evaluate(
      async ([e, p]) => {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ email: e, password: p }),
        });
        return res.status;
      },
      [email, PASSWORD]
    );
    expect(status, 'author could not sign in').toBe(200);
  }

  const draft = (slug: string, status: string) => ({
    type: 'page',
    slug,
    status,
    translations: [{ locale: 'en', title: 'Author draft' }],
  });

  test('an author may create a draft', async ({ page }) => {
    await asAuthor(page);
    const slug = uniqueSlug('author-draft');
    const result = await page.evaluate(async (body) => {
      const res = await fetch('/api/content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(body),
      });
      return { status: res.status, ok: res.ok };
    }, draft(slug, 'draft'));

    expect(result.ok, 'author could not save a draft').toBe(true);

    // The row is the assertion; the status code is this route's business.
    const row = await withDb(async (db) => {
      const r = await db.query('select status, author_id from content where slug = $1', [slug]);
      return r.rows[0] as { status: string; author_id: string } | undefined;
    });
    expect(row?.status).toBe('draft');
    expect(row?.author_id).toBe(authorId);
  });

  test('an author may NOT publish', async ({ page }) => {
    await asAuthor(page);
    const result = await page.evaluate(async (body) => {
      const res = await fetch('/api/content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(body),
      });
      return { status: res.status, body: await res.json() };
    }, draft(uniqueSlug('author-publish'), 'published'));

    // Refused outright, not silently saved as a draft.
    expect(result.status).toBe(403);
    expect(JSON.stringify(result.body)).toContain('المحرّر');
  });

  test('an author may NOT credit the post to someone else', async ({ page }) => {
    await asAuthor(page);
    const slug = uniqueSlug('author-attrib');

    const ok = await page.evaluate(
      async ([body, someoneElse]) => {
        const res = await fetch('/api/content', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ ...(body as object), authorId: someoneElse }),
        });
        return res.ok;
      },
      [draft(slug, 'draft'), '00000000-0000-4000-8000-000000000009'] as const
    );
    expect(ok).toBe(true);

    // Accepted, but attributed to the session — not to the id supplied.
    const owner = await withDb(async (db) => {
      const r = await db.query('select author_id from content where slug = $1', [slug]);
      return r.rows[0]?.author_id as string;
    });
    expect(owner).toBe(authorId);
  });

  test('an author may NOT edit someone else’s page', async ({ page }) => {
    await asAuthor(page);
    const result = await page.evaluate(
      async ([id, body]) => {
        const res = await fetch(`/api/content/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify(body),
        });
        return { status: res.status };
      },
      [editorsContentId, draft('hijacked', 'draft')] as const
    );
    expect(result.status).toBe(403);

    // And it is untouched.
    const still = await withDb(async (db) => {
      const r = await db.query('select status from content where id = $1', [editorsContentId]);
      return r.rows[0].status as string;
    });
    expect(still).toBe('published');
  });
});
