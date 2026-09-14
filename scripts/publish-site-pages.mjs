#!/usr/bin/env node
// scripts/publish-site-pages.mjs
//
// Publishes every extracted page into a running CMS in one command, instead of
// opening Admin → Pages → New thirteen times and pasting by hand.
//
// It drives the same HTTP API the admin screens drive — login, list, create,
// update — so every server-side guard still applies: the origin check, the
// session cookie, the role check, the block validation, and the sanitiser that
// runs at render. Nothing here touches the database directly, and nothing here
// can publish something a logged-in editor could not.
//
// Input is the output of scripts/extract-site-content.mjs: a directory of
// HTML fragments plus the pages.json manifest that names each one's slug,
// title and content type.
//
// A manifest entry may instead carry `blocks`, a literal block array used as
// the page body in place of any file. That is how a page gets STRUCTURED
// content — a faq block with question and answer fields, which a theme pack
// can render itself and which the route turns into FAQPage schema — without
// anyone retyping it into the admin:
//
//   { "slug": "faq", "type": "page", "title": "FAQ",
//     "blocks": [{ "type": "faq", "items": [{ "question": "...", "answer": "..." }] }] }
//
// Idempotent by slug. A slug that already exists is UPDATED, not duplicated —
// `content.slug` has an index but no unique constraint, so a blind create
// would leave two pages fighting over one address.
//
// Credentials come from the environment, never from argv: a password on the
// command line lands in shell history and in `ps` output.
//
//   export CMS_EMAIL='admin@example.com'
//   export CMS_PASSWORD='…'
//   node scripts/publish-site-pages.mjs --url https://al-ai.example --dir dist/content --dry-run
//   node scripts/publish-site-pages.mjs --url https://al-ai.example --dir dist/content

import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { splitTopLevel } from './lib/split-sections.mjs';

/** Zod rejects anything else, and a 400 per page is a poor way to find out. */
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** contentPayloadSchema caps these; longer is dropped, not truncated. */
const META_DESCRIPTION_MAX = 500;
const META_TITLE_MAX = 255;

export function parseArgs(argv) {
  const out = {
    url: null,
    dir: null,
    locale: 'en',
    status: 'published',
    dryRun: false,
    only: [],
    split: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--url') out.url = argv[i + 1] ?? null;
    if (argv[i] === '--dir') out.dir = argv[i + 1] ?? null;
    if (argv[i] === '--locale') out.locale = argv[i + 1] ?? out.locale;
    if (argv[i] === '--status') out.status = argv[i + 1] ?? out.status;
    if (argv[i] === '--dry-run') out.dryRun = true;
    if (argv[i] === '--split') out.split = true;
    if (argv[i] === '--only') out.only = (argv[i + 1] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  }
  return out;
}

/**
 * The request body for one page.
 *
 * Exported and pure so the shape can be tested without a server: getting
 * `content` wrong (the html block's field is `content`, not `html`) fails the
 * block registry, and getting the locale wrong writes a page nobody sees.
 */
/**
 * The request body for one page.
 *
 * `entry.blocks`, when the manifest supplies it, is used verbatim in place of
 * the html file. That is how a page gets STRUCTURED content — a faq block with
 * its question and answer fields, rather than markup — without an editor
 * retyping it into the admin, and it is the only way such a page can be built
 * reproducibly for the next site.
 *
 * Exported and pure so the shape can be tested without a server: getting
 * `content` wrong (the html block's field is `content`, not `html`) fails the
 * block registry, and getting the locale wrong writes a page nobody sees.
 */
export function buildPayload(entry, html, { locale, status, split = false }) {
  const meta = (entry.metaDescription ?? '').trim();
  const metaTitle = (entry.metaTitle ?? '').trim();
  const ogImage = (entry.ogImage ?? '').trim();

  return {
    slug: entry.slug,
    status,
    translations: [
      {
        locale,
        title: entry.title,
        // No isolate/fullPage: both only matter when the site shell renders the
        // block, and with the theme pack active the pack's template does.
        body: entry.blocks ?? htmlBlocks(html, split),
        /*
         * The SEO/AEO fields. generateMetadata() prefers metaTitle over title
         * and metaDescription over excerpt, so a page with these set controls
         * its own search and share appearance; without them it falls back to
         * the on-page heading, which is usually too short to be a good result.
         *
         * Each is omitted when blank rather than sent empty: the route writes
         * what it receives, and an empty string would overwrite a value an
         * editor had typed in the admin.
         */
        ...(metaTitle && metaTitle.length <= META_TITLE_MAX ? { metaTitle } : {}),
        ...(meta && meta.length <= META_DESCRIPTION_MAX ? { metaDescription: meta } : {}),
        ...(ogImage ? { ogImage } : {}),
      },
    ],
  };
}

/**
 * One `html` block, or one per top-level section.
 *
 * A whole page in a single block is editable only by editing raw markup, and
 * no part of it can be moved or deleted on its own. Splitting at the top level
 * gives an editor move-up, move-down and delete per band of the page, with the
 * theme's markup untouched inside each one — which structured blocks could not
 * do, since a theme pack renders only 10 of the 33 types.
 *
 * Falls back to a single block when the fragment will not split cleanly.
 * splitTopLevel() returns null unless the pieces reassemble into the input
 * byte for byte, so the choice is between an exact split and no split; it
 * never publishes markup it has reshaped.
 */
export function htmlBlocks(html, split) {
  if (!split) return [htmlBlock(html)];
  const parts = splitTopLevel(html);
  if (!parts || parts.length < 2) return [htmlBlock(html)];
  return parts.map(htmlBlock);
}

/**
 * One html block, with isolation OFF.
 *
 * `isolate` defaults to ON, which wraps the block in a `html-scope-…` div and
 * prefixes any pasted `<style>` rules with that class, so legacy CSS cannot
 * restyle the site chrome. That is the right default for a paste of unknown
 * provenance.
 *
 * It is the wrong one here. A migrated fragment carries no <style> at all —
 * its CSS is in the theme pack — so scoping has nothing to scope and all that
 * survives is the extra div. Harmless for a descendant selector and not for a
 * direct-child one: `#tt-page-content > .tt-section` stops matching through it,
 * and the failure is a layout that is subtly wrong rather than an error.
 */
function htmlBlock(content) {
  return { type: 'html', content, isolate: false };
}

/** Reasons a manifest entry cannot be published, as sentences. */
export function validateEntry(entry) {
  const problems = [];
  if (!entry || typeof entry !== 'object') return ['not an object'];
  if (typeof entry.slug !== 'string' || !SLUG_RE.test(entry.slug)) {
    problems.push(`slug "${entry.slug}" is not lowercase-and-hyphens`);
  }
  if (typeof entry.title !== 'string' || entry.title.trim() === '') {
    problems.push('title is empty');
  }
  if (Array.isArray(entry.blocks)) {
    if (entry.blocks.length === 0) problems.push('blocks is an empty array');
    else if (entry.blocks.some((b) => typeof b?.type !== 'string')) {
      problems.push('every entry in blocks needs a string `type`');
    }
  } else if (typeof entry.file !== 'string' || !entry.file.endsWith('.html')) {
    problems.push('file is not an .html name, and no blocks were given instead');
  }
  if ((entry.metaDescription ?? '').length > META_DESCRIPTION_MAX) {
    problems.push(`metaDescription is ${entry.metaDescription.length} chars, over the ${META_DESCRIPTION_MAX} limit — it will be left unset`);
  }
  if ((entry.metaTitle ?? '').length > META_TITLE_MAX) {
    problems.push(`metaTitle is ${entry.metaTitle.length} chars, over the ${META_TITLE_MAX} limit — it will be left unset`);
  }
  return problems;
}

/**
 * A minimal cookie jar.
 *
 * The session is two HttpOnly cookies set by /api/auth/login; fetch does not
 * keep them, so they are carried by hand. Only name=value is retained —
 * attributes are the browser's business and sending them back would be wrong.
 */
function jarFrom(response) {
  const jar = new Map();
  for (const line of response.headers.getSetCookie?.() ?? []) {
    const [pair] = line.split(';');
    const eq = pair.indexOf('=');
    if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
  }
  return jar;
}

const cookieHeader = (jar) => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');

/**
 * Every call carries Origin.
 *
 * lib/auth/api-guard.ts refuses a request whose Origin does not match Host,
 * and a bare fetch sends no Origin at all — which is the 403
 * "Cross-site request blocked" and not, as it reads, a credentials problem.
 */
async function call(base, pathname, { method = 'GET', body, jar } = {}) {
  const url = new URL(pathname, base);
  const res = await fetch(url, {
    method,
    headers: {
      origin: new URL(base).origin,
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(jar && jar.size ? { cookie: cookieHeader(jar) } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    redirect: 'manual',
  });

  let parsed = null;
  try {
    parsed = await res.json();
  } catch {
    // A proxy error page, a redirect, an HTML 500 — report the status instead.
  }
  return { res, json: parsed };
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

async function main() {
  const { url, dir, locale, status, dryRun, only, split } = parseArgs(process.argv.slice(2));

  if (!url || !dir) {
    fail(
      'Usage: node scripts/publish-site-pages.mjs --url <site> --dir <content dir>\n' +
        '       [--locale en] [--status published|draft] [--only slug,slug] [--split] [--dry-run]\n' +
        '       CMS_EMAIL and CMS_PASSWORD must be set in the environment.'
    );
  }
  if (!['draft', 'published', 'archived'].includes(status)) {
    fail(`--status must be draft, published or archived (got "${status}")`);
  }

  const manifestPath = path.join(dir, 'pages.json');
  let manifest;
  try {
    // Read and parse as separate steps. Collapsing them reports a file that is
    // present but malformed as a file that is missing, which sends somebody
    // looking for it in the wrong place — it did exactly that once.
    const text = await fs.readFile(manifestPath, 'utf8');
    try {
      manifest = JSON.parse(text);
    } catch (err) {
      fail(`${manifestPath} is not valid JSON: ${err.message}`);
    }
  } catch (err) {
    if (err?.code === 'ENOENT') {
      let sibling = '';
      try {
        const names = (await fs.readdir(dir)).filter((n) => n.endsWith('.html'));
        sibling = names.length
          ? `\n  ${dir} does hold ${names.length} .html file(s), so only the manifest is missing.`
          : `\n  ${dir} holds no .html files either — is that the right directory?`;
      } catch {
        sibling = `\n  ${dir} could not be listed — is that the right directory?`;
      }
      fail(`No manifest at ${manifestPath}.${sibling}\n  Run scripts/extract-site-content.mjs to write one.`);
    }
    fail(`Could not read ${manifestPath}: ${err.message}`);
  }

  if (!Array.isArray(manifest)) {
    fail(`${manifestPath} must be a JSON array of page entries.`);
  }

  const wanted = only.length ? manifest.filter((e) => only.includes(e.slug)) : manifest;
  if (only.length && wanted.length !== only.length) {
    const found = new Set(wanted.map((e) => e.slug));
    fail(`--only named slugs that are not in the manifest: ${only.filter((s) => !found.has(s)).join(', ')}`);
  }

  // Validate the whole manifest before sending anything, so a bad entry is not
  // discovered after six pages are already live.
  const blocking = [];
  for (const entry of wanted) {
    for (const problem of validateEntry(entry)) {
      if (problem.includes('will be left unset')) console.warn(`  warn  ${entry.slug}: ${problem}`);
      else blocking.push(`${entry.slug ?? '?'}: ${problem}`);
    }
  }
  if (blocking.length) fail(`Manifest problems:\n  ${blocking.join('\n  ')}`);

  // Read every fragment up front, for the same reason. An entry carrying its
  // own `blocks` needs no file, so it is not looked for.
  const bodies = new Map();
  for (const entry of wanted) {
    if (entry.blocks) { bodies.set(entry.slug, ''); continue; }
    try {
      bodies.set(entry.slug, await fs.readFile(path.join(dir, entry.file), 'utf8'));
    } catch {
      fail(`Missing fragment: ${path.join(dir, entry.file)}`);
    }
  }

  if (dryRun) {
    console.log(
      `Would publish ${wanted.length} page(s) to ${url} as ${status}, locale ${locale}` +
        `${split ? ', split into sections' : ''}:`
    );
    for (const entry of wanted) {
      const body = entry.blocks ?? htmlBlocks(bodies.get(entry.slug), split);
      const kb = (bodies.get(entry.slug).length / 1024).toFixed(1);
      const shape = entry.blocks
        ? `${String(body.length).padStart(2)} ${body.map((b) => b.type).join('+')}`
        : split
          ? `${String(body.length).padStart(2)} block(s)`
          : '';
      console.log(
        `  ${entry.type.padEnd(4)}  ${entry.slug.padEnd(38)} ${String(kb).padStart(6)} KB ${shape}  ${entry.title}`
      );
    }
    console.log('\nNo request was made. Drop --dry-run to publish.');
    return;
  }

  const email = process.env.CMS_EMAIL;
  const password = process.env.CMS_PASSWORD;
  if (!email || !password) fail('Set CMS_EMAIL and CMS_PASSWORD in the environment.');

  const login = await call(url, '/api/auth/login', {
    method: 'POST',
    body: { email, password },
  });
  if (!login.res.ok) {
    // The API answers login failures generically on purpose; pass it through
    // rather than guessing which half was wrong.
    fail(`Login failed (${login.res.status}): ${login.json?.error?.message ?? 'no message'}`);
  }
  const jar = jarFrom(login.res);
  if (!jar.has('access_token')) fail('Login returned no access_token cookie.');

  // One listing per content type in play, so create-vs-update is decided from
  // what the server actually holds.
  const existing = new Map();
  for (const type of new Set(wanted.map((e) => e.type))) {
    const list = await call(url, `/api/content?type=${encodeURIComponent(type)}`, { jar });

    /*
     * 405 and 404 mean the route is there but has no GET — a deployment from
     * before the listing endpoint existed. Worth naming, because the generic
     * message ("no message", since the 405 carries no JSON body) reads like a
     * bug in this script and the fix is a deploy.
     *
     * Proceeding without the listing is NOT offered. Telling an update from a
     * create is the whole reason for this call, and content.slug has an index
     * but no unique constraint: creating blindly would leave two pages at one
     * address with row order deciding which the site serves.
     */
    if (list.res.status === 405 || list.res.status === 404) {
      fail(
        `${url} has no GET /api/content — it is running a build from before that ` +
          `endpoint existed.\n  Deploy the current branch to this service, then run ` +
          `this again.\n  Without the listing there is no way to tell an update from a ` +
          `create, and slugs are not unique, so publishing would duplicate pages.`
      );
    }
    if (!list.res.ok) {
      fail(`Could not list "${type}" (${list.res.status}): ${list.json?.error?.message ?? 'no message'}`);
    }
    for (const row of list.json?.data ?? []) existing.set(`${type}|${row.slug}`, row.id);
  }

  let created = 0;
  let updated = 0;
  const failures = [];

  for (const entry of wanted) {
    const payload = buildPayload(entry, bodies.get(entry.slug), { locale, status, split });
    const id = existing.get(`${entry.type}|${entry.slug}`);

    const result = id
      ? await call(url, `/api/content/${id}`, { method: 'PUT', body: payload, jar })
      : await call(url, '/api/content', { method: 'POST', body: { ...payload, type: entry.type }, jar });

    if (!result.res.ok) {
      const message = result.json?.error?.message ?? `HTTP ${result.res.status}`;
      const issues = result.json?.error?.issues?.map((i) => `${i.path?.join('.')}: ${i.message}`) ?? [];
      failures.push(`${entry.slug}: ${message}${issues.length ? ` (${issues.join('; ')})` : ''}`);
      console.log(`  FAIL    ${entry.slug}`);
      continue;
    }

    if (id) updated += 1;
    else created += 1;
    console.log(`  ${id ? 'updated' : 'created'} ${entry.slug}`);
  }

  console.log(`\nCreated ${created}, updated ${updated}, failed ${failures.length}.`);
  if (failures.length) {
    console.log('\nFailures:');
    for (const line of failures) console.log(`  ${line}`);
    process.exit(1);
  }
}

// Importable for tests; only the CLI path runs main().
if (process.argv[1] && process.argv[1].endsWith('publish-site-pages.mjs')) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
