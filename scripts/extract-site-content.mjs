#!/usr/bin/env node
// scripts/extract-site-content.mjs
//
// Lifts the body of each page of a static HTML site into a standalone fragment
// that the CMS can store as an `html` block, plus a pages.json manifest that
// scripts/publish-site-pages.mjs reads.
//
// A theme pack's templates deliberately hold only the chrome. Everything
// between the site's content markers — the hero and every section — is page
// CONTENT, so an editor can change it without a redeploy. This performs that
// split once, per page.
//
// Three rewrites happen on the way out:
//
//   1. Inter-page links lose their .html suffix and gain a locale prefix, so
//      about.html becomes /en/about. Slugs are mapped explicitly in the site
//      config rather than derived, because filenames differ from slugs in case
//      more often than not, and a lowercasing rule alone would silently
//      produce dead links.
//
//   2. Media moves to /uploads/<prefix>/<file>. Content images cannot live in
//      the theme pack: content is stored in the database and rendered without
//      Liquid, so it can never resolve the `asset` filter or the pack's
//      /theme-assets/<uuid>/ path. The media library is where they go, and
//      scripts/remap-content-media.mjs finishes the job once they are uploaded.
//
//   3. Inline SVG is dropped. No paste mode allows it — an SVG is a document
//      that can carry <script> — and the sanitiser keeps the TEXT inside the
//      tags it removes, so lettering curved around a circle by <textpath>
//      arrives as loose sentences down the margin. Off with content.stripSvg.
//
// Everything site-specific lives in themes/<site>/site.config.json.
//
// Usage:
//   node scripts/extract-site-content.mjs --site al-ai --src <dir-of-html> --out <dir>

import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { loadSiteConfig, siteDir } from './lib/site-config.mjs';

export function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Replace an <img> whose src is a missing file with a looping muted video. */
export function applyMediaReplacements(html, prefix, rules) {
  let out = html;

  for (const rule of rules) {
    const src = `/uploads/${prefix}/${rule.missing}`;

    if (rule.as !== 'video') {
      // A like-for-like swap: same element, different file.
      out = out.split(src).join(`/uploads/${prefix}/${rule.replacement}`);
      continue;
    }

    // `as: 'video'` is not decoration. An <img> cannot play an MP4 — pointing
    // its src at one renders the alt text — so the whole element is replaced,
    // not just the path. `muted` is required or the browser refuses to
    // autoplay, and object-fit keeps the video filling the box.
    const tag = new RegExp(`<img\\b[^>]*\\bsrc=["']${escapeRe(src)}["'][^>]*>`, 'gi');
    out = out.replace(
      tag,
      '<video autoplay="" muted="" loop="" playsinline="" webkit-playsinline="" ' +
        'preload="metadata" style="width: 100%; height: 100%; object-fit: cover;" ' +
        `aria-label="${rule.label ?? ''}">` +
        `<source src="/uploads/${prefix}/${rule.replacement}" type="video/mp4">` +
        '</video>'
    );
  }

  return out;
}

function parseArgs(argv) {
  const out = { site: null, src: null, out: null, locale: null, prefix: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--site') out.site = argv[i + 1] ?? null;
    if (argv[i] === '--src') out.src = argv[i + 1] ?? null;
    if (argv[i] === '--out') out.out = argv[i + 1] ?? null;
    if (argv[i] === '--locale') out.locale = argv[i + 1] ?? null;
    if (argv[i] === '--prefix') out.prefix = argv[i + 1] ?? null;
  }
  return out;
}

/**
 * The page body: everything between the site's two markers.
 *
 * Located by string search rather than a DOM parse because the markers are
 * unique and stable across a site's pages by construction — if they were not,
 * they would be the wrong markers — and adding a parser dependency to read a
 * fixed slice would buy nothing.
 */
export function extractBody(html, { open, close }) {
  const at = html.indexOf(open);
  if (at === -1) return null;
  const start = at + open.length;
  const end = html.indexOf(close, start);
  if (end === -1) return null;
  return html.slice(start, end).trim();
}

/**
 * The page <title>, minus the site prefix the originals repeat on every page.
 *
 * Storing the whole string would render "site.com | About Us" inside the page
 * heading AND again in the browser tab beside the site name — so the prefix is
 * dropped here and the site name left to the layout, where it belongs.
 */
export function extractTitle(html, fallback, separator = '|') {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  if (!match) return fallback;
  const text = decodeEntities(match[1].replace(/\s+/g, ' ').trim());
  if (!separator) return text || fallback;
  const bar = text.lastIndexOf(separator);
  const tail = bar === -1 ? text : text.slice(bar + separator.length).trim();
  return tail || fallback;
}

/** <meta name="description">, empty on most pages of a hand-built site. */
export function extractDescription(html) {
  const tag = /<meta\b[^>]*\bname=["']description["'][^>]*>/i.exec(html);
  if (!tag) return '';
  const content = /\bcontent=["']([\s\S]*?)["']/i.exec(tag[0]);
  return content ? decodeEntities(content[1].replace(/\s+/g, ' ').trim()) : '';
}

/** Only the five named entities a title or description realistically carries. */
function decodeEntities(text) {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'");
}

/**
 * Title from the slug, for a page whose <title> is missing or is nothing but
 * the site prefix. "behavioral-intelligence" is a poor heading, but a blank
 * one is worse — and the CMS refuses an empty title outright.
 */
export function titleFromSlug(slug) {
  return slug
    .split('-')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function rewrite(body, config, { locale, prefix }) {
  let out = body;

  // Inter-page links, longest filename first so no name is a prefix of another.
  for (const name of Object.keys(config.slugs).sort((a, b) => b.length - a.length)) {
    const slug = config.slugs[name];
    const target = slug ? `/${locale}/${slug}` : `/${locale}`;
    out = out.split(`"${name}"`).join(`"${target}"`);
    out = out.split(`'${name}'`).join(`'${target}'`);
  }

  // Links to pages that were never built as files: the two policy pages the
  // original 404s on, and a blog index the CMS provides but the site did not.
  for (const [name, target] of Object.entries(config.linkRewrites)) {
    const resolved = target.replace('{locale}', locale);
    out = out.split(`"${name}"`).join(`"${resolved}"`);
    out = out.split(`'${name}'`).join(`'${resolved}'`);
  }

  // Content media moves to the media library; keep the basename so a human can
  // match a file on disk to a reference in the markup. Covers img and vids —
  // a demo post usually pulls video from the latter.
  out = out.replace(
    /(["'(])assets\/(?:img|vids|images|video|videos)\/[^"')]*?\/?([^/"')]+\.(?:png|jpe?g|webp|gif|svg|mp4|webm|ico))/gi,
    (_m, quote, file) => `${quote}/uploads/${prefix}/${file}`
  );

  if (config.content.stripSvg) {
    out = out.replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, '');
  }

  // Runs last: it matches on the rewritten /uploads/ paths.
  return applyMediaReplacements(out, prefix, config.mediaReplacements);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.site || !args.src || !args.out) {
    console.error(
      'Usage: node scripts/extract-site-content.mjs --site <name> --src <dir> --out <dir>\n' +
        '       [--locale en] [--prefix <media prefix>]'
    );
    process.exit(1);
  }

  const config = await loadSiteConfig(args.site);
  const locale = args.locale ?? config.locale;
  const prefix = args.prefix ?? config.prefix;
  const out = args.out;

  await fs.mkdir(out, { recursive: true });
  const written = [];
  const skipped = [];
  const manifest = [];

  for (const [name, slug] of Object.entries(config.slugs)) {
    let html;
    try {
      html = await fs.readFile(path.join(args.src, name), 'utf8');
    } catch {
      skipped.push(`${name} (not found)`);
      continue;
    }

    const body = extractBody(html, config.content);
    if (!body) {
      skipped.push(`${name} (markers not found — check content.open/close)`);
      continue;
    }

    // The CMS slug, which is NOT the URL slug for the front page: the home
    // page is stored under 'home' (app/(site)/[locale]/page.tsx looks it up by
    // that name) and serves at /<locale>, with no slug in the path.
    const cmsSlug = slug || 'home';
    const file = `${cmsSlug}.html`;

    await fs.writeFile(path.join(out, file), `${rewrite(body, config, { locale, prefix })}\n`, 'utf8');
    written.push(`${file}  (${(body.length / 1024).toFixed(1)} KB)`);

    manifest.push({
      file,
      slug: cmsSlug,
      type: config.postSlugs.includes(cmsSlug) ? 'post' : 'page',
      title: extractTitle(html, titleFromSlug(cmsSlug), config.content.titleSeparator),
      metaDescription: extractDescription(html),
    });
  }

  /*
   * Pages the pack writes itself, copied through verbatim — policy templates
   * and anything else with no original to lift from. Here so one command
   * produces every page the site needs, and so they reach the manifest.
   */
  for (const [file, title] of Object.entries(config.packPages)) {
    const from = path.join(siteDir(config.site), 'content', file);
    try {
      await fs.writeFile(path.join(out, file), await fs.readFile(from, 'utf8'), 'utf8');
    } catch {
      skipped.push(`${file} (not in themes/${config.site}/content)`);
      continue;
    }
    written.push(file);
    manifest.push({ file, slug: file.replace(/\.html$/, ''), type: 'page', title, metaDescription: '' });
  }

  /*
   * The manifest is what makes bulk publishing possible: it carries each
   * page's slug, title and content type, so nobody retypes them into a form.
   */
  await fs.writeFile(path.join(out, 'pages.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  console.log(`Wrote ${written.length} page bodies and pages.json to ${out}`);
  for (const w of written) console.log(`  ${w}`);
  if (skipped.length) {
    console.log(`Skipped ${skipped.length}:`);
    for (const s of skipped) console.log(`  ${s}`);
  }
}

// Importable for tests; only the CLI path runs main().
if (process.argv[1] && process.argv[1].endsWith('extract-site-content.mjs')) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
