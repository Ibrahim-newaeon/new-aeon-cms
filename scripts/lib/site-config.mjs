// scripts/lib/site-config.mjs
//
// Loads themes/<site>/site.config.json — everything about one site that the
// onboarding scripts would otherwise hard-code.
//
// The split is deliberate. A site's TEMPLATES are written by hand, because
// only a person can look at a page and decide what is chrome and what is
// content. Everything else — which files the pages live in, which slug each
// becomes, what order the stylesheets load in, which images belong to the
// chrome — is data, and lives here so onboarding the second site is a config
// file rather than a second copy of three scripts.
//
// Validated on load, with the field named. A typo in a 90-line JSON file is
// otherwise found as `undefined is not iterable` halfway through a build.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

export const themesDir = () => path.join(process.cwd(), 'themes');
export const siteDir = (site) => path.join(themesDir(), site);

/** Optional field, with the default applied and the type enforced. */
function optional(value, fallback, check, field, problems) {
  if (value === undefined) return fallback;
  if (!check(value)) problems.push(`${field} is the wrong type`);
  return value;
}

const isString = (v) => typeof v === 'string' && v.trim() !== '';
const isStringArray = (v) => Array.isArray(v) && v.every(isString);
const isStringMap = (v) =>
  v !== null && typeof v === 'object' && !Array.isArray(v) && Object.values(v).every((x) => typeof x === 'string');

/**
 * Normalises a raw config into the shape the scripts consume.
 *
 * Exported separately from load() so it can be tested without a file, and so a
 * caller holding a parsed object (a test, a future admin screen) can reuse the
 * same checks rather than write a second, looser set.
 */
export function normaliseSiteConfig(raw, site = '<site>') {
  const problems = [];
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`${site}/site.config.json is not an object`);
  }

  if (!isString(raw.name)) problems.push('name is required');
  if (!isString(raw.prefix)) problems.push('prefix is required');

  const content = raw.content ?? {};
  if (!isString(content.open)) problems.push('content.open is required (the marker the page body starts after)');
  if (!isString(content.close)) problems.push('content.close is required (the marker the page body ends before)');

  if (!isStringMap(raw.slugs)) problems.push('slugs must be a { "file.html": "slug" } map');
  else if (Object.keys(raw.slugs).length === 0) problems.push('slugs is empty');

  const build = raw.build ?? {};
  if (!isStringArray(build.cssOrder)) problems.push('build.cssOrder must be a non-empty list of paths');
  if (!isStringArray(build.jsOrder)) problems.push('build.jsOrder must be a non-empty list of paths');

  for (const rule of raw.mediaReplacements ?? []) {
    if (!isString(rule?.missing) || !isString(rule?.replacement)) {
      problems.push('every mediaReplacements entry needs `missing` and `replacement`');
      break;
    }
  }

  if (problems.length) {
    throw new Error(`${site}/site.config.json:\n  ${problems.join('\n  ')}`);
  }

  const shims = build.shims ?? {};
  const typeProblems = [];
  const config = {
    site,
    name: raw.name,
    prefix: raw.prefix,
    locale: optional(raw.locale, 'en', isString, 'locale', typeProblems),
    content: {
      open: content.open,
      close: content.close,
      // Inline SVG survives no paste mode — the sanitiser drops the tags and
      // keeps the text, so decorative lettering arrives as loose sentences.
      stripSvg: optional(content.stripSvg, true, (v) => typeof v === 'boolean', 'content.stripSvg', typeProblems),
      // "site.com | About Us" — the part before it repeats on every page.
      titleSeparator: optional(content.titleSeparator, '|', isString, 'content.titleSeparator', typeProblems),
    },
    slugs: raw.slugs,
    postSlugs: optional(raw.postSlugs, [], isStringArray, 'postSlugs', typeProblems),
    linkRewrites: optional(raw.linkRewrites, {}, isStringMap, 'linkRewrites', typeProblems),
    packPages: optional(raw.packPages, {}, isStringMap, 'packPages', typeProblems),
    mediaReplacements: optional(raw.mediaReplacements, [], Array.isArray, 'mediaReplacements', typeProblems),
    build: {
      cssOrder: build.cssOrder,
      jsOrder: build.jsOrder,
      packCss: optional(build.packCss, [], isStringArray, 'build.packCss', typeProblems),
      shims: {
        before: optional(shims.before, [], isStringArray, 'build.shims.before', typeProblems),
        after: optional(shims.after, [], isStringArray, 'build.shims.after', typeProblems),
      },
      chromeImages: optional(build.chromeImages, [], isStringArray, 'build.chromeImages', typeProblems),
      cssSiblingImages: optional(build.cssSiblingImages, [], isStringArray, 'build.cssSiblingImages', typeProblems),
      // Font Awesome asks for ../webfonts/ from the stylesheet; a pack without
      // it renders every icon as a blank box. Optional: not every site has one.
      webfonts: optional(build.webfonts, null, (v) => v === null || isString(v), 'build.webfonts', typeProblems),
    },
  };

  if (typeProblems.length) {
    throw new Error(`${site}/site.config.json:\n  ${typeProblems.join('\n  ')}`);
  }
  return config;
}

export async function loadSiteConfig(site) {
  if (!isString(site) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(site)) {
    throw new Error(`--site must be a directory name under themes/ (got "${site}")`);
  }
  const file = path.join(siteDir(site), 'site.config.json');
  let raw;
  try {
    raw = JSON.parse(await fs.readFile(file, 'utf8'));
  } catch (err) {
    if (err instanceof SyntaxError) throw new Error(`${file} is not valid JSON: ${err.message}`);
    throw new Error(`No config at ${file}. See docs/onboarding-a-site.md.`);
  }
  return normaliseSiteConfig(raw, site);
}
