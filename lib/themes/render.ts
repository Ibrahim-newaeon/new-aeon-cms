// lib/themes/render.ts
// Liquid-based HTML theme renderer. Templates are fragments inside <main>
// (Next still owns <html>/<body>). Theme JS/CSS are served as static assets.
//
// `{% render 'path/to/file.html' %}` is expanded in our code before Liquid
// runs — LiquidJS path lookup was brittle with extname and quoted names.

import { Liquid } from 'liquidjs';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { ThemeManifest } from './package';
import { themeDir, themeAssetUrl } from './store';
import { sanitizeScopedCss } from '@/lib/blocks/sanitize';

export interface ThemeRenderContext {
  locale: 'ar' | 'en';
  dir: 'rtl' | 'ltr';
  site: {
    name: string;
    description?: string | null;
    logo?: string | null;
  };
  page: {
    title: string;
    excerpt?: string | null;
    content: string;
    slug?: string;
  };
  posts?: { title: string; excerpt?: string | null; url: string }[];
  navigation?: { label: string; url: string }[];
}

async function readTemplate(root: string, rel: string): Promise<string> {
  const cleaned = rel.replace(/^\/+/, '').split('/').filter((p) => p && p !== '..').join('/');
  const file = path.join(root, cleaned);
  if (!file.startsWith(root + path.sep)) {
    throw new Error('Unsafe template path');
  }
  return fs.readFile(file, 'utf8');
}

/** Expand `{% render 'file.html' %}` / `{% include 'file.html' %}` up to 5 levels. */
export async function expandPartials(src: string, root: string, depth = 0): Promise<string> {
  if (depth > 5) return src;
  const re = /\{%\s*(?:render|include)\s+['"]([^'"]+)['"]\s*%\}/g;
  let out = '';
  let last = 0;
  for (const match of src.matchAll(re)) {
    const idx = match.index ?? 0;
    out += src.slice(last, idx);
    const partial = await readTemplate(root, match[1]!);
    out += await expandPartials(partial, root, depth + 1);
    last = idx + match[0].length;
  }
  out += src.slice(last);
  return out;
}

/**
 * Render ONE block through a pack-supplied partial, or null when it ships none.
 *
 * The seam that lets a pack style a block type the shared renderer cannot.
 * `blocksToHtml()` emits plain semantic HTML — `<div class="prose">`,
 * `<figure>` — which is correct for any theme and native to none, and it
 * returns '' outright for the 23 types it does not handle. A pack that ships
 * `partials/block-faq.html` gets its own markup for `faq`, with its own
 * classes and its own JS hooks, without a line of theme-specific code in a
 * shared module.
 *
 * The block's fields are the scope, so the partial reads `{{ block.items }}`
 * the way a template reads `{{ page.title }}`.
 *
 * Returns null rather than throwing when the partial is absent: absence is the
 * normal case and means "fall back to the generic rendering".
 */
export async function renderBlockPartial(
  themeId: string,
  manifest: ThemeManifest,
  block: { type: string } & Record<string, unknown>,
  scope: { locale: string; dir: string } = { locale: 'en', dir: 'ltr' }
): Promise<string | null> {
  const rel = manifest.partials?.[`block-${block.type}`];
  if (!rel) return null;

  const root = themeDir(themeId);
  let src: string;
  try {
    src = await expandPartials(await readTemplate(root, rel), root);
  } catch {
    // A manifest naming a partial that is not in the zip must not take the
    // page down — the rest of the content is still correct without it.
    return null;
  }

  const engine = new Liquid({
    cache: false,
    strictFilters: false,
    strictVariables: false,
    ownPropertyOnly: true,
  });
  engine.registerFilter('asset', (r: unknown) => {
    if (typeof r !== 'string' || !r.trim()) return '';
    const cleaned = r.replace(/^\/+/, '').split('/').filter((x) => x && x !== '..').join('/');
    return themeAssetUrl(themeId, cleaned);
  });

  return engine.parseAndRender(src, { block, ...scope });
}

/**
 * Render a themable page.
 * - layout.html wraps with {{ content }}
 * - home/page/post/blog templates are the inner body
 * - Partials: {% render 'partials/header.html' %}
 * - Assets: {{ 'assets/theme.css' | asset }}
 */
export async function renderThemePage(
  themeId: string,
  manifest: ThemeManifest,
  kind: 'home' | 'page' | 'post' | 'blog',
  ctx: ThemeRenderContext
): Promise<{ html: string; cssHrefs: string[]; jsHrefs: string[] }> {
  const root = themeDir(themeId);
  const engine = new Liquid({
    cache: false,
    strictFilters: false,
    strictVariables: false,
    ownPropertyOnly: true,
  });

  engine.registerFilter('asset', (rel: unknown) => {
    if (typeof rel !== 'string' || !rel.trim()) return '';
    const cleaned = rel.replace(/^\/+/, '').split('/').filter((p) => p && p !== '..').join('/');
    return themeAssetUrl(themeId, cleaned);
  });

  const innerRel =
    kind === 'home'
      ? manifest.templates.home ?? manifest.templates.page ?? manifest.templates.layout
      : kind === 'blog'
        ? manifest.templates.blog ?? manifest.templates.page ?? manifest.templates.layout
        : kind === 'post'
          ? manifest.templates.post ?? manifest.templates.page ?? manifest.templates.layout
          : manifest.templates.page ?? manifest.templates.layout;

  const scope = {
    locale: ctx.locale,
    dir: ctx.dir,
    site: ctx.site,
    page: ctx.page,
    posts: ctx.posts ?? [],
    navigation: ctx.navigation ?? [],
  };

  const innerSrc = await expandPartials(await readTemplate(root, innerRel), root);
  const innerHtml = await engine.parseAndRender(innerSrc, scope);

  let html = innerHtml;
  if (innerRel !== manifest.templates.layout) {
    const layoutSrc = await expandPartials(await readTemplate(root, manifest.templates.layout), root);
    html = await engine.parseAndRender(layoutSrc, { ...scope, content: innerHtml });
  }

  const cssHrefs: string[] = [];
  const jsHrefs: string[] = [];
  try {
    const assetsDir = path.join(root, 'assets');
    const files = await fs.readdir(assetsDir);
    for (const f of files) {
      if (f.endsWith('.css')) cssHrefs.push(themeAssetUrl(themeId, `assets/${f}`));
      if (f.endsWith('.js')) jsHrefs.push(themeAssetUrl(themeId, `assets/${f}`));
    }
  } catch {
    // no assets folder
  }

  html = html.replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gi, (_full: string, css: string) => {
    return `<style>${sanitizeScopedCss(css)}</style>`;
  });

  return { html, cssHrefs, jsHrefs };
}
