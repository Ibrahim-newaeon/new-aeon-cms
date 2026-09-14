#!/usr/bin/env node
// scripts/extract-al-ai-content.mjs
//
// Lifts the body of each original al-ai.ai page into a standalone HTML fragment
// that can be pasted into Admin → Pages as an `html` block.
//
// The pack's templates deliberately hold only the chrome. Everything between
// <div id="tt-content-wrap"> and <footer id="tt-footer"> — the hero and every
// section — is page CONTENT, so that an editor can change it without a redeploy.
// This script performs that split once.
//
// Two rewrites happen on the way out:
//
//   1. Inter-page links lose their .html suffix and gain a locale prefix, so
//      about.html becomes /en/about. Slugs are mapped explicitly below rather
//      than derived, because three of them differ in case from their filename
//      and a lowercasing rule alone would silently produce dead links.
//
//   2. Image sources move to /uploads/<prefix>/<file>. Content images cannot
//      live in the theme pack: content is stored in the database and rendered
//      without Liquid, so it can never resolve the `asset` filter or the
//      pack's /theme-assets/<uuid>/ path. The media library is where they go.
//
// Usage:
//   node scripts/extract-al-ai-content.mjs --src <dir-of-html> --out <dir> [--locale en] [--prefix al-ai]

import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

/** Original filename → CMS slug. Home is '' because it renders at /<locale>. */
const SLUGS = {
  'index.html': '',
  'about.html': 'about',
  'services.html': 'services',
  'contact.html': 'contact',
  'data-driven.html': 'data-driven',
  'digital-media.html': 'digital-media',
  'search-engine.html': 'search-engine',
  'agentic-AI-and-multi-agent-systems.html': 'agentic-ai-and-multi-agent-systems',
  'automated-decision-making-and-BPA.html': 'automated-decision-making-and-bpa',
  'behavioral-intelligence.html': 'behavioral-intelligence',
  'conversational-and-edge-analytics.html': 'conversational-and-edge-analytics',
  'polarization-and-pre-indoctrination.html': 'polarization-and-pre-indoctrination',
  'blog-post-sidebar.html': 'blog-post-sidebar',
};

/**
 * Stand-ins for media the live server no longer has.
 *
 * `ai-driven.png` is referenced by services.html and returns 404 on al-ai.ai —
 * it was deleted from the server at some point, so there is nothing to
 * re-download and no copy in the source drop. bg-brain2.mp4 is live, supplied,
 * and fills the same slot, so it stands in.
 *
 * `as: 'video'` is not decoration. An <img> cannot play an MP4 — pointing its
 * src at one renders the alt text — so the whole element is replaced, not just
 * the path. `muted` is required or the browser refuses to autoplay, and
 * object-fit keeps the video filling the box the image used to fill.
 */
/** Pages the pack writes itself, copied through verbatim. See themes/al-ai/content/. */
const PACK_PAGES = {
  'privacy-policy.html': 'Privacy Policy',
  'terms-and-conditions.html': 'Terms & Conditions',
};

const MEDIA_REPLACEMENTS = [
  { missing: 'ai-driven.png', replacement: 'bg-brain2.mp4', as: 'video', label: 'AI-driven systems' },
];

/** Replace an <img> whose src is a missing file with a looping muted video. */
function applyMediaReplacements(html, prefix) {
  let out = html;

  for (const rule of MEDIA_REPLACEMENTS) {
    if (rule.as !== 'video') continue;

    const src = `/uploads/${prefix}/${rule.missing}`;
    // Any <img> tag carrying that src, whatever order its attributes are in.
    const tag = new RegExp(`<img\\b[^>]*\\bsrc=["']${escapeRe(src)}["'][^>]*>`, 'gi');

    out = out.replace(
      tag,
      '<video autoplay="" muted="" loop="" playsinline="" webkit-playsinline="" ' +
        'preload="metadata" style="width: 100%; height: 100%; object-fit: cover;" ' +
        `aria-label="${rule.label}">` +
        `<source src="/uploads/${prefix}/${rule.replacement}" type="video/mp4">` +
        '</video>'
    );
  }

  return out;
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseArgs(argv) {
  const out = { src: null, out: null, locale: 'en', prefix: 'al-ai' };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--src') out.src = argv[i + 1] ?? null;
    if (argv[i] === '--out') out.out = argv[i + 1] ?? null;
    if (argv[i] === '--locale') out.locale = argv[i + 1] ?? out.locale;
    if (argv[i] === '--prefix') out.prefix = argv[i + 1] ?? out.prefix;
  }
  return out;
}

/**
 * The page body: everything inside #tt-content-wrap, minus the footer.
 *
 * Located by string search rather than a DOM parse because the markers are
 * unique and stable across all 13 files, and adding a parser dependency to
 * read a fixed slice would buy nothing.
 */
function extractBody(html) {
  const open = html.indexOf('<div id="tt-content-wrap">');
  if (open === -1) return null;
  const start = open + '<div id="tt-content-wrap">'.length;
  const footer = html.indexOf('<footer id="tt-footer"', start);
  if (footer === -1) return null;
  return html.slice(start, footer).trim();
}

/**
 * The page <title>, minus the site prefix the originals repeat on every page.
 *
 * Every original title reads "al-ai.ai | Something". Storing that whole string
 * as the CMS title would render "al-ai.ai | About Us" inside the page heading
 * AND again in the browser tab beside the site name — so the prefix is dropped
 * here and the site name is left to the layout, which is where it belongs.
 */
export function extractTitle(html, fallback) {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  if (!match) return fallback;
  const text = decodeEntities(match[1].replace(/\s+/g, ' ').trim());
  const bar = text.lastIndexOf('|');
  const tail = bar === -1 ? text : text.slice(bar + 1).trim();
  return tail || fallback;
}

/** <meta name="description">, empty on most of these pages. */
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
 * Title from the filename, for a page whose <title> is missing or is nothing
 * but the site prefix. "agentic-AI-and-multi-agent-systems" is not a heading,
 * but a blank one is worse.
 */
export function titleFromSlug(slug) {
  return slug
    .split('-')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function rewrite(body, locale, prefix) {
  let out = body;

  // Inter-page links, longest filename first so no name is a prefix of another.
  for (const name of Object.keys(SLUGS).sort((a, b) => b.length - a.length)) {
    const slug = SLUGS[name];
    const target = slug ? `/${locale}/${slug}` : `/${locale}`;
    out = out.split(`"${name}"`).join(`"${target}"`);
    out = out.split(`'${name}'`).join(`'${target}'`);
  }

  // The two pages that 404 on the live site are linked but were never built.
  out = out.split('"privacy-policy.html"').join(`"/${locale}/privacy-policy"`);
  out = out.split('"terms-and-conditions.html"').join(`"/${locale}/terms-and-conditions"`);

  // The demo post links a blog index that never existed as a file; the CMS
  // serves one at /<locale>/blog, so point it there.
  out = out.split('"blog-archive.html"').join(`"/${locale}/blog"`);

  // Content media moves to the media library; keep the basename so a human can
  // match a file on disk to a reference in the markup. Covers assets/img and
  // assets/vids — the demo post pulls video from the latter.
  out = out.replace(
    /(["'(])assets\/(?:img|vids)\/[^"')]*?\/?([^/"')]+\.(?:png|jpe?g|webp|gif|mp4|webm|ico))/gi,
    (_m, quote, file) => `${quote}/uploads/${prefix}/${file}`
  );

  /*
   * Drop inline SVG. Settled by reading theme.js, after I argued both sides.
   *
   * No paste mode allows SVG — an SVG is a document that can carry <script>,
   * the same reason image/svg+xml is refused by the media library. The
   * sanitiser discards the tags and KEEPS the text inside them, so
   * "Scroll to Explore", curved around a circle by <textpath> on the original
   * site, arrives as two bare sentences wrapped down the right-hand margin.
   *
   * I removed these, then restored them on the theory that theme.js laid the
   * words out itself and needed them. It does not: theme-before-minify.js
   * touches .tt-scroll-down in three places and every one is a fade or a
   * translate (lines 138, 600, 2255). Nothing there builds circular text.
   *
   * What misled me is that the "Let's connect!" badge DOES curve in the CMS —
   * but that one is per-letter <span>s carrying inline transforms, and trusted
   * mode allows `style`. Two different mechanisms, only one of which survives.
   *
   * Every SVG here is decoration: twelve scroll rings and four arrows, no
   * content. Removing them loses nothing a reader wants, and leaves the
   * orphaned sentences out of the page.
   */
  out = out.replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, '');

  // Runs last: it matches on the rewritten /uploads/ paths.
  out = applyMediaReplacements(out, prefix);

  return out;
}

async function main() {
  const { src, out, locale, prefix } = parseArgs(process.argv.slice(2));
  if (!src || !out) {
    console.error('Usage: node scripts/extract-al-ai-content.mjs --src <dir> --out <dir> [--locale en] [--prefix al-ai]');
    process.exit(1);
  }

  await fs.mkdir(out, { recursive: true });
  const written = [];
  const skipped = [];
  const manifest = [];

  for (const [name, slug] of Object.entries(SLUGS)) {
    let html;
    try {
      html = await fs.readFile(path.join(src, name), 'utf8');
    } catch {
      skipped.push(`${name} (not found)`);
      continue;
    }

    const body = extractBody(html);
    if (!body) {
      skipped.push(`${name} (no #tt-content-wrap)`);
      continue;
    }

    const file = `${slug || 'home'}.html`;
    await fs.writeFile(path.join(out, file), `${rewrite(body, locale, prefix)}\n`, 'utf8');
    written.push(`${file}  (${(body.length / 1024).toFixed(1)} KB)`);

    // The CMS slug, which is NOT the URL slug for the front page: the home
    // page is stored under 'home' (app/(site)/[locale]/page.tsx looks it up by
    // that name) and serves at /<locale>, with no slug in the path.
    const cmsSlug = slug || 'home';
    manifest.push({
      file,
      slug: cmsSlug,
      type: name === 'blog-post-sidebar.html' ? 'post' : 'page',
      title: extractTitle(html, titleFromSlug(cmsSlug)),
      metaDescription: extractDescription(html),
    });
  }

  /*
   * The two policy pages have no original to lift from — they 404 on the live
   * site — so the pack ships written templates instead. Copied in here so one
   * command produces every page the site needs, and so they appear in the
   * manifest the publisher reads.
   */
  for (const [file, title] of Object.entries(PACK_PAGES)) {
    const from = path.join(process.cwd(), 'themes', 'al-ai', 'content', file);
    try {
      await fs.writeFile(path.join(out, file), await fs.readFile(from, 'utf8'), 'utf8');
    } catch {
      skipped.push(`${file} (not in themes/al-ai/content)`);
      continue;
    }
    written.push(file);
    manifest.push({ file, slug: file.replace(/\.html$/, ''), type: 'page', title, metaDescription: '' });
  }

  /*
   * The manifest is what makes bulk publishing possible.
   *
   * scripts/publish-al-ai-pages.mjs reads it to decide each page's slug, title
   * and content type without a human retyping them into a form thirteen times.
   * Written even when a file is skipped, so the two stay in step.
   */
  await fs.writeFile(
    path.join(out, 'pages.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8'
  );

  console.log(`Wrote ${written.length} page bodies and pages.json to ${out}`);
  for (const w of written) console.log(`  ${w}`);
  if (skipped.length) {
    console.log(`Skipped ${skipped.length}:`);
    for (const s of skipped) console.log(`  ${s}`);
  }
}

// Importable for tests; only the CLI path runs main().
if (process.argv[1] && process.argv[1].endsWith('extract-al-ai-content.mjs')) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
