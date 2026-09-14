#!/usr/bin/env node
// scripts/apply-image-alt.mjs
//
// Gives every <img> in a set of extracted fragments an alt attribute.
//
// Alt text is not decoration. A screen reader announces the file name when it
// is absent, and an image search engine has nothing to go on — and for answer
// and generative engines it is one of the few pieces of prose that describes
// what a picture actually shows, on a page where everything else is layout.
//
// Two modes, the same shape as scripts/remap-content-media.mjs:
//
//   --report <file>   write a skeleton naming every image with no alt, with
//                     the page and nearest heading for context
//   --map <file>      apply a filled-in skeleton back into the fragments
//
// The split exists because nobody can write good alt text without seeing the
// image. The report says what needs describing; a human writes the words.
//
// ── Running this AFTER the media remap ──────────────────────────────────────
//
// Both modes key on the image's file name, which scripts/remap-content-media
// rewrites: `/uploads/al-ai/hero.png` becomes `/uploads/2026/09/<uuid>.png`.
// Run this afterwards without help and every key is a uuid — a map written
// against the original names matches nothing, and a fresh report is 21 uuids
// that no human can describe without opening each one.
//
// `--media <file>` fixes that. It is the same `/api/media` export the remap
// consumes, and it lets this script translate between the two names in both
// directions: the report keys by ORIGINAL name whatever the markup says, and
// apply resolves an original-named map onto uuid `src` attributes. With it,
// the order of the two scripts stops mattering.
//
// Usage:
//   node scripts/apply-image-alt.mjs --dir dist/content --report alt.json
//   node scripts/apply-image-alt.mjs --dir dist/content --map alt.json --dry-run
//   node scripts/apply-image-alt.mjs --dir dist/content --map alt.json
//   node scripts/apply-image-alt.mjs --dir dist/content --media media.json --map alt.json

import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

function parseArgs(argv) {
  const out = { dir: null, report: null, map: null, media: null, dryRun: false, overwrite: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--dir') out.dir = argv[i + 1] ?? null;
    if (argv[i] === '--report') out.report = argv[i + 1] ?? null;
    if (argv[i] === '--map') out.map = argv[i + 1] ?? null;
    if (argv[i] === '--media') out.media = argv[i + 1] ?? null;
    if (argv[i] === '--dry-run') out.dryRun = true;
    // Off by default: an alt attribute already present was written by somebody,
    // and replacing it wholesale is how a considered description gets lost.
    if (argv[i] === '--overwrite') out.overwrite = true;
  }
  return out;
}

const IMG = /<img\b[^>]*>/gi;

/** The `src` of one <img> tag, or ''. */
export function srcOf(tag) {
  return (/\bsrc=["']([^"']*)["']/i.exec(tag) ?? ['', ''])[1];
}

/** The existing alt, or null when the attribute is absent entirely. */
export function altOf(tag) {
  const m = /\balt=["']([^"']*)["']/i.exec(tag);
  return m ? m[1] : null;
}

/** Last path segment of a src, which is how the map is keyed. */
export function basename(src) {
  const clean = src.split('?')[0].split('#')[0];
  return clean.slice(clean.lastIndexOf('/') + 1);
}

/**
 * The nearest heading before an image, as context for whoever writes the text.
 *
 * Crude on purpose: it looks backwards for the last heading's inner text and
 * makes no attempt to understand the document. It is a hint in a report, never
 * anything the output depends on.
 */
export function nearestHeading(html, index) {
  const before = html.slice(0, index);
  const matches = [...before.matchAll(/<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>/gi)];
  const last = matches[matches.length - 1];
  if (!last) return '';
  return last[1].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
}

/**
 * Set or replace the alt attribute on one tag.
 *
 * Quotes in the value are escaped, not stripped: alt text is prose and will
 * contain apostrophes, and an unescaped double quote would end the attribute
 * and turn the rest of the sentence into bogus attributes.
 */
export function withAlt(tag, alt) {
  const value = alt.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  if (/\balt=["'][^"']*["']/i.test(tag)) {
    return tag.replace(/\balt=["'][^"']*["']/i, `alt="${value}"`);
  }
  // Insert before the tag's own close, so `/>` and `>` both survive.
  return tag.replace(/\s*\/?>$/, (end) => ` alt="${value}"${end.trimStart() === '/>' ? ' />' : '>'}`);
}

/**
 * Two lookups built from an /api/media export: original name → stored name,
 * and back again.
 *
 * Later rows win, walking in reverse for the same reason remap-content-media
 * does: re-uploading a file leaves both rows in place and the newer one is
 * what an editor just put there.
 */
export function nameMaps(parsed) {
  const assets = Array.isArray(parsed) ? parsed : (parsed?.data ?? []);
  const toStored = new Map();
  const toOriginal = new Map();
  for (const a of [...assets].reverse()) {
    const original = a?.originalName ?? a?.original_name;
    const url = a?.url;
    if (typeof original !== 'string' || typeof url !== 'string') continue;
    const stored = url.split('?')[0].split('#')[0].split('/').pop();
    if (!stored) continue;
    toStored.set(original, stored);
    toOriginal.set(stored, original);
  }
  return { toStored, toOriginal };
}

/**
 * The name this image should be keyed by: its original name when the media
 * list knows one, otherwise whatever is in the markup.
 *
 * Keying reports by the original name is what makes them legible — a list of
 * uuids tells whoever writes the alt text nothing, and they cannot open the
 * file to look without resolving it first.
 */
export function keyFor(name, maps) {
  return maps?.toOriginal.get(name) ?? name;
}

/** Map lookup that accepts either name for the same image. */
export function lookup(map, name, maps) {
  return (
    map[name] ??
    (maps ? map[maps.toOriginal.get(name) ?? ''] : undefined) ??
    (maps ? map[maps.toStored.get(name) ?? ''] : undefined)
  );
}

async function loadMedia(file) {
  if (!file) return null;
  try {
    return nameMaps(JSON.parse(await fs.readFile(file, 'utf8')));
  } catch (err) {
    throw new Error(`Could not read the media list at ${file}: ${err.message}`);
  }
}

async function htmlFiles(dir) {
  return (await fs.readdir(dir)).filter((f) => f.endsWith('.html')).sort();
}

async function report(dir, out, maps) {
  const skeleton = {};
  let total = 0;
  let described = 0;

  for (const file of await htmlFiles(dir)) {
    const html = await fs.readFile(path.join(dir, file), 'utf8');
    for (const m of html.matchAll(IMG)) {
      total += 1;
      const alt = altOf(m[0]);
      if (alt !== null && alt.trim() !== '') { described += 1; continue; }

      const name = keyFor(basename(srcOf(m[0])), maps);
      if (!name) continue;
      // Keyed by file name: the same image often appears on several pages and
      // wants the same description on each.
      skeleton[name] ??= { pages: [], context: nearestHeading(html, m.index ?? 0), alt: '' };
      if (!skeleton[name].pages.includes(file)) skeleton[name].pages.push(file);
    }
  }

  await fs.writeFile(out, `${JSON.stringify(skeleton, null, 2)}\n`, 'utf8');
  const missing = Object.keys(skeleton).length;
  console.log(`${total} image(s): ${described} described, ${total - described} not.`);
  console.log(`Wrote ${missing} entr${missing === 1 ? 'y' : 'ies'} to ${out}.`);
  console.log('Fill in each "alt", then re-run with --map.');
}

async function apply(dir, mapFile, { dryRun, overwrite, maps }) {
  const map = JSON.parse(await fs.readFile(mapFile, 'utf8'));

  const blank = Object.entries(map).filter(([, v]) => !(v?.alt ?? '').trim());
  if (blank.length) {
    console.log(`Skipping ${blank.length} entr${blank.length === 1 ? 'y' : 'ies'} with no alt written yet:`);
    for (const [name] of blank) console.log(`  ${name}`);
  }

  let applied = 0;
  let kept = 0;
  let touched = 0;
  const unmatched = new Set();

  for (const file of await htmlFiles(dir)) {
    const full = path.join(dir, file);
    const before = await fs.readFile(full, 'utf8');

    const after = before.replace(IMG, (tag) => {
      const existing = altOf(tag);
      if (existing !== null && existing.trim() !== '' && !overwrite) { kept += 1; return tag; }

      const name = basename(srcOf(tag));
      const entry = lookup(map, name, maps);
      const alt = (entry?.alt ?? '').trim();
      if (!alt) {
        if (existing === null) unmatched.add(keyFor(name, maps));
        return tag;
      }
      applied += 1;
      return withAlt(tag, alt);
    });

    if (after !== before) {
      touched += 1;
      if (!dryRun) await fs.writeFile(full, after, 'utf8');
    }
  }

  console.log(
    `${dryRun ? 'Would set' : 'Set'} alt on ${applied} image(s) across ${touched} file(s).` +
      (kept ? ` Left ${kept} existing description(s) alone.` : '')
  );
  if (unmatched.size) {
    console.log(`\nStill without alt, and not in the map (${unmatched.size}):`);
    for (const name of [...unmatched].sort()) console.log(`  ${name}`);
    if (!maps) {
      // The failure this hint exists for: a map written against the original
      // names, applied after the remap has replaced them with uuids.
      console.log(
        '\nIf these are uuids, the media remap has already run. Pass --media <api-media.json>\n' +
          'so the original names in the map can be resolved onto them.'
      );
    }
  }
}

async function main() {
  const { dir, report: reportFile, map, media, dryRun, overwrite } = parseArgs(process.argv.slice(2));
  if (!dir || (!reportFile && !map)) {
    console.error(
      'Usage: node scripts/apply-image-alt.mjs --dir <content dir> --report <file> [--media <file>]\n' +
        '       node scripts/apply-image-alt.mjs --dir <content dir> --map <file> [--media <file>] [--dry-run] [--overwrite]'
    );
    process.exit(1);
  }
  const maps = await loadMedia(media);
  if (reportFile) await report(dir, reportFile, maps);
  else await apply(dir, map, { dryRun, overwrite, maps });
}

if (process.argv[1] && process.argv[1].endsWith('apply-image-alt.mjs')) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
