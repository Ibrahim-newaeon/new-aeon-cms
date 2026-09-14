#!/usr/bin/env node
// scripts/build-theme-pack.mjs
//
// Assembles themes/<site> into an installable HTML theme pack zip.
//
// Why a build step rather than a checked-in zip:
//
//   1. The pack's CSS and JS must each be a SINGLE top-level file. The renderer
//      auto-discovers them with fs.readdir(assets) and emits one <script defer>
//      per hit (lib/themes/render.ts). readdir order is filesystem order, not
//      alphabetical, so shipping jquery.min.js and theme.js as separate files
//      would load them in an undefined order — and theme.js needs jQuery.
//      Concatenating in the configured source order fixes that by construction.
//
//   2. Inline <script> tags in a template never run. The rendered HTML reaches
//      the page through dangerouslySetInnerHTML (components/site/theme-pack-
//      view.tsx), and innerHTML does not execute scripts. Everything the
//      original site had inline must therefore be in the bundle — which is
//      what themes/<site>/shims/ is for.
//
//   3. The vendor libraries and fonts are megabytes of third-party binaries.
//      They live in a source drop outside git and are pulled in at build time.
//
// Everything site-specific lives in themes/<site>/site.config.json.
//
// Usage:
//   node scripts/build-theme-pack.mjs --site al-ai --src <drop> [--out <dir>]
//
// <drop> is the unpacked source with css/, js/, vendor/ and img/ inside it.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import JSZip from 'jszip';
import { loadSiteConfig, siteDir } from './lib/site-config.mjs';

function parseArgs(argv) {
  const out = { site: null, src: null, out: path.join(process.cwd(), 'dist', 'themes') };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--site') out.site = argv[i + 1] ?? null;
    if (argv[i] === '--src') out.src = argv[i + 1] ?? null;
    if (argv[i] === '--out') out.out = argv[i + 1] ?? out.out;
  }
  return out;
}

/** Read a required file, failing with the path rather than a bare ENOENT. */
async function readRequired(base, rel, what) {
  const file = path.join(base, rel);
  try {
    return await fs.readFile(file);
  } catch {
    throw new Error(`Missing ${what}: ${rel} (looked in ${base})`);
  }
}

async function addDir(zip, dir, prefix) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) await addDir(zip, full, rel);
    else zip.file(rel, await fs.readFile(full));
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.site || !args.src) {
    console.error('Usage: node scripts/build-theme-pack.mjs --site <name> --src <drop> [--out <dir>]');
    process.exit(1);
  }

  const config = await loadSiteConfig(args.site);
  const pack = siteDir(config.site);
  const { src, out } = args;
  const zip = new JSZip();

  // Manifest and templates travel verbatim.
  zip.file('theme.json', await fs.readFile(path.join(pack, 'theme.json')));
  await addDir(zip, path.join(pack, 'templates'), 'templates');
  await addDir(zip, path.join(pack, 'partials'), 'partials');

  // One stylesheet, in link order, with the pack's own CSS last so it wins.
  const css = [];
  for (const rel of config.build.cssOrder) {
    css.push(`/* ===== ${rel} ===== */`);
    css.push((await readRequired(src, rel, 'stylesheet')).toString('utf8'));
  }
  for (const rel of config.build.packCss) {
    css.push(`/* ===== ${rel} (pack) ===== */`);
    css.push((await readRequired(pack, rel, 'pack stylesheet')).toString('utf8'));
  }
  zip.file(`assets/${config.site}.css`, css.join('\n'));

  // One script, in load order, wrapped by the pack's compatibility shims.
  const js = [];
  for (const rel of config.build.shims.before) {
    js.push((await readRequired(pack, rel, 'shim')).toString('utf8'));
  }
  for (const rel of config.build.jsOrder) {
    js.push(`/* ===== ${rel} ===== */`);
    js.push((await readRequired(src, rel, 'script')).toString('utf8'));
    // A minified vendor file may end mid-statement; the separator keeps the
    // next one from being parsed as its continuation.
    js.push(';');
  }
  for (const rel of config.build.shims.after) {
    js.push((await readRequired(pack, rel, 'shim')).toString('utf8'));
  }
  zip.file(`assets/${config.site}.js`, js.join('\n'));

  // Font Awesome's CSS asks for ../webfonts/, which from assets/<site>.css
  // resolves to the pack root. Put them exactly there.
  if (config.build.webfonts) {
    await addDir(zip, path.join(src, config.build.webfonts), 'webfonts');
  }

  // url() targets that sit beside the stylesheet.
  for (const name of config.build.cssSiblingImages) {
    zip.file(`assets/${name}`, await readRequired(src, path.join('css', name), 'stylesheet image'));
  }

  /*
   * Chrome images only — header, footer, loader, page transition.
   *
   * Section and banner images are NOT here on purpose. They appear inside page
   * content, which is stored in the database and rendered without Liquid, so
   * it cannot resolve /theme-assets/{uuid}/… — and that uuid changes every
   * time the pack is re-uploaded. Those belong in the media library, where an
   * editor can replace them.
   */
  for (const name of config.build.chromeImages) {
    zip.file(`assets/img/${name}`, await readRequired(src, path.join('img', name), 'chrome image'));
  }

  await fs.mkdir(out, { recursive: true });
  const target = path.join(out, `${config.site}.zip`);
  const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  await fs.writeFile(target, buf);

  console.log(`Built ${target} (${(buf.length / 1024 / 1024).toFixed(2)} MB) for ${config.name}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
