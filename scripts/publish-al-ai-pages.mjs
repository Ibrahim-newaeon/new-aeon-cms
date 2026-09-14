#!/usr/bin/env node
// scripts/publish-al-ai-pages.mjs
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
// Input is the output of scripts/extract-al-ai-content.mjs: a directory of
// HTML fragments plus the pages.json manifest that names each one's slug,
// title and content type.
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
//   node scripts/publish-al-ai-pages.mjs --url https://al-ai.example --dir dist/content --dry-run
//   node scripts/publish-al-ai-pages.mjs --url https://al-ai.example --dir dist/content

import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

/** Zod rejects anything else, and a 400 per page is a poor way to find out. */
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** contentPayloadSchema caps metaDescription; longer is dropped, not truncated. */
const META_DESCRIPTION_MAX = 500;

export function parseArgs(argv) {
  const out = {
    url: null,
    dir: null,
    locale: 'en',
    status: 'published',
    dryRun: false,
    only: [],
  };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--url') out.url = argv[i + 1] ?? null;
    if (argv[i] === '--dir') out.dir = argv[i + 1] ?? null;
    if (argv[i] === '--locale') out.locale = argv[i + 1] ?? out.locale;
    if (argv[i] === '--status') out.status = argv[i + 1] ?? out.status;
    if (argv[i] === '--dry-run') out.dryRun = true;
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
export function buildPayload(entry, html, { locale, status }) {
  const meta = (entry.metaDescription ?? '').trim();
  return {
    slug: entry.slug,
    status,
    translations: [
      {
        locale,
        title: entry.title,
        // No isolate/fullPage: both only matter when the site shell renders the
        // block, and with the theme pack active the pack's template does.
        body: [{ type: 'html', content: html }],
        ...(meta && meta.length <= META_DESCRIPTION_MAX ? { metaDescription: meta } : {}),
      },
    ],
  };
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
  if (typeof entry.file !== 'string' || !entry.file.endsWith('.html')) {
    problems.push('file is not an .html name');
  }
  if ((entry.metaDescription ?? '').length > META_DESCRIPTION_MAX) {
    problems.push(`metaDescription is ${entry.metaDescription.length} chars, over the ${META_DESCRIPTION_MAX} limit — it will be left unset`);
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
  const { url, dir, locale, status, dryRun, only } = parseArgs(process.argv.slice(2));

  if (!url || !dir) {
    fail(
      'Usage: node scripts/publish-al-ai-pages.mjs --url <site> --dir <content dir>\n' +
        '       [--locale en] [--status published|draft] [--only slug,slug] [--dry-run]\n' +
        '       CMS_EMAIL and CMS_PASSWORD must be set in the environment.'
    );
  }
  if (!['draft', 'published', 'archived'].includes(status)) {
    fail(`--status must be draft, published or archived (got "${status}")`);
  }

  const manifestPath = path.join(dir, 'pages.json');
  let manifest;
  try {
    manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  } catch {
    fail(`No manifest at ${manifestPath}. Run scripts/extract-al-ai-content.mjs first.`);
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

  // Read every fragment up front, for the same reason.
  const bodies = new Map();
  for (const entry of wanted) {
    try {
      bodies.set(entry.slug, await fs.readFile(path.join(dir, entry.file), 'utf8'));
    } catch {
      fail(`Missing fragment: ${path.join(dir, entry.file)}`);
    }
  }

  if (dryRun) {
    console.log(`Would publish ${wanted.length} page(s) to ${url} as ${status}, locale ${locale}:`);
    for (const entry of wanted) {
      const kb = (bodies.get(entry.slug).length / 1024).toFixed(1);
      console.log(`  ${entry.type.padEnd(4)}  ${entry.slug.padEnd(38)} ${String(kb).padStart(6)} KB  ${entry.title}`);
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
    if (!list.res.ok) {
      fail(`Could not list "${type}" (${list.res.status}): ${list.json?.error?.message ?? 'no message'}`);
    }
    for (const row of list.json?.data ?? []) existing.set(`${type}|${row.slug}`, row.id);
  }

  let created = 0;
  let updated = 0;
  const failures = [];

  for (const entry of wanted) {
    const payload = buildPayload(entry, bodies.get(entry.slug), { locale, status });
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
if (process.argv[1] && process.argv[1].endsWith('publish-al-ai-pages.mjs')) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
