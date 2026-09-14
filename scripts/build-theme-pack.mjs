#!/usr/bin/env node
// scripts/build-theme-pack.mjs
//
// Assembles themes/al-ai into an installable HTML theme pack zip.
//
// Why a build step rather than a checked-in zip:
//
//   1. The pack's CSS and JS must each be a SINGLE top-level file. The renderer
//      auto-discovers them with fs.readdir(assets) and emits one <script defer>
//      per hit (lib/themes/render.ts). readdir order is filesystem order, not
//      alphabetical, so shipping jquery.min.js and theme.js as separate files
//      would load them in an undefined order — and theme.js needs jQuery.
//      Concatenating in the source order fixes that by construction.
//
//   2. Inline <script> tags in a template never run. The rendered HTML reaches
//      the page through dangerouslySetInnerHTML (components/site/theme-pack-
//      view.tsx), and innerHTML does not execute scripts. Everything the
//      original site had inline must therefore be in the bundle.
//
//   3. The vendor libraries and fonts are ~2 MB of third-party binaries. They
//      live in a source drop outside git and are pulled in at build time.
//
// Usage:
//   node scripts/build-theme-pack.mjs --src <drop> [--out <dir>]
//
// <drop> is the unpacked source with css/, js/, vendor/ and img/ inside it.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import JSZip from 'jszip';

const PACK_DIR = path.join(process.cwd(), 'themes', 'al-ai');

/** Stylesheets, in the order the original pages linked them. Later wins. */
const CSS_ORDER = [
  'vendor/fontawesome/css/all.min.css',
  'vendor/fancybox/css/fancybox.css',
  'vendor/swiper/css/swiper-bundle.min.css',
  'css/helper.css',
  'css/theme-black.css',
];

/** Scripts, in the order the original pages loaded them. Order is load-bearing. */
const JS_ORDER = [
  'vendor/jquery/jquery.min.js',
  'vendor/gsap/gsap.min.js',
  'vendor/gsap/ScrollToPlugin.min.js',
  'vendor/gsap/ScrollTrigger.min.js',
  'vendor/lenis.min.js',
  'vendor/isotope/imagesloaded.pkgd.min.js',
  'vendor/isotope/isotope.pkgd.min.js',
  'vendor/isotope/packery-mode.pkgd.min.js',
  'vendor/fancybox/js/fancybox.umd.js',
  'vendor/swiper/js/swiper-bundle.min.js',
  'js/theme.js',
];

/**
 * Images that belong to the CHROME — header, footer, loader, page transition.
 * Only these ship in the pack, because only templates can reach them through
 * the `asset` filter.
 *
 * Section and banner images are NOT here on purpose. They appear inside page
 * content, which is stored in the database and rendered without Liquid, so it
 * cannot resolve `/theme-assets/{uuid}/…`. Those belong in the media library,
 * where an editor can replace them. See themes/al-ai/README.md.
 */
const CHROME_IMAGES = ['al-ai.png', 'Revacity.png'];

/** Referenced by url() inside helper.css / theme-black.css, relative to the CSS file. */
const CSS_SIBLING_IMAGES = ['bg-noise.png', 'hero3-overlay.png'];

/**
 * Re-applies the four <body> classes theme.js checks for with hasClass(), and
 * makes the body visible. The CMS renders its own <body class="site-body …">,
 * so without this the page transition never initialises — and the original
 * inline loader script, which is what set visibility, cannot run from innerHTML.
 */
const PRELUDE = `/* --- al-ai pack prelude: CMS shell compatibility --- */
(function () {
  var b = document.body;
  if (!b) return;
  ['tt-transition', 'tt-noise', 'tt-magic-cursor', 'tt-smooth-scroll'].forEach(function (c) {
    b.classList.add(c);
  });
  b.style.visibility = 'visible';
})();
`;

/**
 * Retires the contact form's POST.
 *
 * theme.js binds a submit handler that posts to "mail.php" (see
 * theme-before-minify.js around line 1600). There is no PHP runtime here, so
 * that request would 404 and the theme would show its own error styling to a
 * visitor who had just filled the form in — worse than not offering to send.
 *
 * This unbinds it and shows the direct contact routes instead. Wiring the form
 * to the CMS is a one-line change once that is wanted: POST to /api/forms.
 */
const POSTLUDE = `/* --- al-ai pack postlude: contact form is display-only --- */
(function ($) {
  if (typeof $ !== 'function') return;
  $(function () {
    var $form = $('#tt-contact-form');
    if (!$form.length) return;
    $form.off('submit').on('submit', function (e) {
      e.preventDefault();
      var $box = $('#tt-contact-form-messages');
      $box.find('.tt-cfm-inner').html(
        '<span class="tt-cfm-error">This form is not connected yet. ' +
        'Please email <a href="mailto:info@al-ai.ai">info@al-ai.ai</a> ' +
        'or call +(962) 659 310 29.</span>'
      );
      $box.addClass('visible');
    });
  });
})(window.jQuery);
`;

/**
 * The loader dismissal, lifted verbatim from the inline <script> at the foot of
 * index.html. Nothing else removes #al-loader, which covers the viewport at
 * z-index 999999 — so if this is dropped, every page renders as a black screen.
 *
 * Two departures from the original, both because this now runs inside React.
 *
 * The class goes on <html>, not on the loader element. React re-renders the
 * pack's markup on a hydration mismatch, replacing #al-loader with a fresh
 * node — and a reference captured at startup then points at a detached
 * element. The original put the class on that reference, so the page kept a
 * brand new loader over it forever. An ancestor React never touches survives
 * any number of re-mounts, and loader.css carries the matching rule.
 *
 * The element is also looked up at reveal time rather than at startup, for the
 * same reason: whatever is in the document then is what needs removing.
 *
 * The #mainBanner iframe it waits on is stripped by the sanitiser — iframe is
 * in no paste mode's tag list — so whenIframeLoaded() resolves immediately.
 * Left in place because the page it was written for may regain one.
 */
const LOADER = `/* --- al-ai pack: loader dismissal (was inline in index.html) --- */
(function () {
  var iframe = document.getElementById('mainBanner');
  var MIN_MS = 900, MAX_MS = 20000, start = Date.now(), done = false;

  function reveal() {
    if (done) return; done = true;
    document.body.style.visibility = 'visible';
    document.documentElement.classList.add('al-loaded');

    // Looked up now, not at startup: a re-render may have replaced it.
    var el = document.getElementById('al-loader');
    if (el) {
      el.classList.add('al-hide');
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 700);
    }
  }

  function whenWindowLoaded() {
    return new Promise(function (resolve) {
      if (document.readyState === 'complete') return resolve();
      window.addEventListener('load', resolve, { once: true });
    });
  }

  function whenIframeLoaded() {
    return new Promise(function (resolve) {
      if (!iframe) { resolve(); return; }
      var settled = false;
      function mark() { if (settled) return; settled = true; resolve(); }
      iframe.addEventListener('load', mark, { once: true });
      setTimeout(mark, 15000);
    });
  }

  Promise.all([whenWindowLoaded(), whenIframeLoaded()]).then(function () {
    setTimeout(reveal, Math.max(0, MIN_MS - (Date.now() - start)));
  });

  setTimeout(reveal, MAX_MS);
})();
`;

function parseArgs(argv) {
  const out = { src: null, out: path.join(process.cwd(), 'dist', 'themes') };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--src') out.src = argv[i + 1] ?? null;
    if (argv[i] === '--out') out.out = argv[i + 1] ?? out.out;
  }
  return out;
}

/** Read a required file, failing with the path rather than a bare ENOENT. */
async function readRequired(base, rel) {
  const file = path.join(base, rel);
  try {
    return await fs.readFile(file);
  } catch {
    throw new Error(`Missing source file: ${rel} (looked in ${base})`);
  }
}

async function addDir(zip, dir, prefix) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      await addDir(zip, full, rel);
    } else {
      zip.file(rel, await fs.readFile(full));
    }
  }
}

async function main() {
  const { src, out } = parseArgs(process.argv.slice(2));
  if (!src) {
    console.error('Usage: node scripts/build-theme-pack.mjs --src <drop> [--out <dir>]');
    process.exit(1);
  }

  const zip = new JSZip();

  // Manifest and templates travel verbatim.
  zip.file('theme.json', await fs.readFile(path.join(PACK_DIR, 'theme.json')));
  await addDir(zip, path.join(PACK_DIR, 'templates'), 'templates');
  await addDir(zip, path.join(PACK_DIR, 'partials'), 'partials');

  // One stylesheet, in link order.
  const css = [];
  for (const rel of CSS_ORDER) {
    css.push(`/* ===== ${rel} ===== */`);
    css.push((await readRequired(src, rel)).toString('utf8'));
  }
  css.push(`/* ===== loader (was inline in index.html) ===== */`);
  css.push(await fs.readFile(path.join(PACK_DIR, 'assets', 'loader.css'), 'utf8'));
  zip.file('assets/al-ai.css', css.join('\n'));

  // One script, in load order, wrapped by the two compatibility shims.
  const js = [PRELUDE];
  for (const rel of JS_ORDER) {
    js.push(`/* ===== ${rel} ===== */`);
    js.push((await readRequired(src, rel)).toString('utf8'));
    js.push(';');
  }
  js.push(POSTLUDE);
  js.push(LOADER);
  zip.file('assets/al-ai.js', js.join('\n'));

  // Font Awesome's CSS asks for ../webfonts/, which from assets/al-ai.css
  // resolves to the pack root. Put them exactly there.
  const webfontDir = path.join(src, 'vendor', 'fontawesome', 'webfonts');
  await addDir(zip, webfontDir, 'webfonts');

  // url() targets that sit beside the stylesheet.
  for (const name of CSS_SIBLING_IMAGES) {
    zip.file(`assets/${name}`, await readRequired(src, path.join('css', name)));
  }

  // Chrome images only.
  for (const name of CHROME_IMAGES) {
    zip.file(`assets/img/${name}`, await readRequired(src, path.join('img', name)));
  }

  await fs.mkdir(out, { recursive: true });
  const target = path.join(out, 'al-ai.zip');
  const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  await fs.writeFile(target, buf);

  console.log(`Built ${target} (${(buf.length / 1024 / 1024).toFixed(2)} MB)`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
