#!/usr/bin/env node
// scripts/remap-content-media.mjs
//
// Rewrites the media paths in extracted page content to the URLs the media
// library actually issued.
//
// scripts/extract-al-ai-content.mjs points every image at
// `/uploads/<prefix>/<original filename>` — a placeholder, because at
// extraction time nobody knows where the file will end up. The media library
// then stores it under a generated name (lib/media/storage.ts): a UUID, an
// extension, and a year/month prefix. The original name survives only as the
// `original_name` column, which is exactly the join this script performs.
//
// A media FOLDER is not part of any URL, so organising uploads into one called
// "al-ai" changes nothing about their addresses. That is the mistake this
// script exists to repair.
//
// Getting the media list, logged into the admin in a browser:
//
//   open https://<your-domain>/api/media   and save the JSON
//
// The session cookie rides along, which is simpler than reproducing it in curl.
//
// Usage:
//   node scripts/remap-content-media.mjs --media media.json --dir dist/content
//                                        [--prefix al-ai] [--dry-run]

import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

function parseArgs(argv) {
  const out = { media: null, dir: null, prefix: 'al-ai', dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--media') out.media = argv[i + 1] ?? null;
    if (argv[i] === '--dir') out.dir = argv[i + 1] ?? null;
    if (argv[i] === '--prefix') out.prefix = argv[i + 1] ?? out.prefix;
    if (argv[i] === '--dry-run') out.dryRun = true;
  }
  return out;
}

/** Accepts the API envelope `{ success, data: [...] }` or a bare array. */
function assetsFrom(parsed) {
  if (Array.isArray(parsed)) return parsed;
  if (parsed && Array.isArray(parsed.data)) return parsed.data;
  throw new Error('Expected an array of assets, or { data: [...] } from /api/media');
}

/**
 * original_name → url.
 *
 * Later rows win. Re-uploading a file leaves both rows in place, and the newer
 * one is the one an editor just put there — which is also why the API returns
 * newest first and this walks the list in reverse.
 */
function buildMap(assets) {
  const map = new Map();
  for (const a of [...assets].reverse()) {
    const name = a?.originalName ?? a?.original_name;
    const url = a?.url;
    if (typeof name === 'string' && typeof url === 'string') map.set(name, url);
  }
  return map;
}

async function main() {
  const { media, dir, prefix, dryRun } = parseArgs(process.argv.slice(2));
  if (!media || !dir) {
    console.error(
      'Usage: node scripts/remap-content-media.mjs --media <media.json> --dir <content dir> [--prefix al-ai] [--dry-run]'
    );
    process.exit(1);
  }

  const assets = assetsFrom(JSON.parse(await fs.readFile(media, 'utf8')));
  const byName = buildMap(assets);
  console.log(`Loaded ${byName.size} media assets.`);

  const files = (await fs.readdir(dir)).filter((f) => f.endsWith('.html'));
  const missing = new Map();
  let rewritten = 0;
  let touched = 0;

  const placeholder = new RegExp(`/uploads/${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/([A-Za-z0-9._-]+)`, 'g');

  for (const name of files) {
    const file = path.join(dir, name);
    const before = await fs.readFile(file, 'utf8');

    const after = before.replace(placeholder, (whole, filename) => {
      const url = byName.get(filename);
      if (!url) {
        // Left exactly as it was. A broken path a human can read beats a
        // silently-dropped image nobody notices until a client does.
        missing.set(filename, (missing.get(filename) ?? 0) + 1);
        return whole;
      }
      rewritten += 1;
      return url;
    });

    if (after !== before) {
      touched += 1;
      if (!dryRun) await fs.writeFile(file, after, 'utf8');
    }
  }

  console.log(
    `${dryRun ? 'Would rewrite' : 'Rewrote'} ${rewritten} reference(s) across ${touched} file(s).`
  );

  if (missing.size) {
    console.log(`\nNot found in the media library (${missing.size}), left untouched:`);
    for (const [name, count] of [...missing].sort()) {
      console.log(`  ${name}  (${count}x)`);
    }
    console.log('\nUpload these, re-export the media list, and run again.');
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
