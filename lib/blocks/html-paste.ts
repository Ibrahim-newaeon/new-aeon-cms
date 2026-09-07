// lib/blocks/html-paste.ts
//
// Paste-HTML v2 pipeline: document unwrap → style extract → sanitize by tier
// → optional CSS scoping. Keeps legacy markup usable without becoming a theme
// engine (that is the later html-pack driver).

import { createHash } from 'node:crypto';
import {
  type HtmlPasteMode,
  sanitizeHtmlForMode,
  sanitizeScopedCss,
} from './sanitize';

export interface HtmlPasteOptions {
  mode: HtmlPasteMode;
  /** Scope CSS when true (default). Off only for deliberate full-bleed pages. */
  isolate?: boolean;
  /** Stable id so SSR and client agree on the scope class. */
  scopeId?: string;
}

export interface HtmlPasteResult {
  html: string;
  css: string;
  scopeClass: string | null;
}

/**
 * Strip a full HTML document down to body contents.
 *
 * Pasted export from an old site often includes <!doctype>, <html>, <head>.
 * Those must not land inside our <main>.
 */
export function unwrapHtmlDocument(raw: string): { body: string; headCss: string } {
  const input = raw ?? '';
  if (!/<html[\s>]/i.test(input) && !/<body[\s>]/i.test(input)) {
    return { body: input, headCss: '' };
  }

  const headMatch = input.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
  const bodyMatch = input.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const head = headMatch?.[1] ?? '';
  const body = bodyMatch?.[1] ?? input;

  const headCss = extractStyleTagContents(head).join('\n');
  return { body, headCss };
}

/** Pull every <style>…</style> inner text; order preserved. */
export function extractStyleTagContents(html: string): string[] {
  const out: string[] = [];
  const re = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    if (m[1]?.trim()) out.push(m[1]);
  }
  return out;
}

export function stripStyleTags(html: string): string {
  return html.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
}

/**
 * Prefix selectors so pasted CSS cannot restyle the site chrome.
 *
 * Not a full CSS parser — good enough for migration pastes. @keyframes /
 * @font-face / @import are passed through unchanged (imports are later
 * stripped by sanitizeScopedCss).
 */
export function scopeCss(css: string, scopeSelector: string): string {
  const trimmed = css.trim();
  if (!trimmed) return '';

  let i = 0;
  let out = '';

  while (i < trimmed.length) {
    const at = trimmed.indexOf('{', i);
    if (at === -1) {
      out += trimmed.slice(i);
      break;
    }

    const prelude = trimmed.slice(i, at).trim();
    const close = findMatchingBrace(trimmed, at);
    if (close === -1) {
      out += trimmed.slice(i);
      break;
    }
    const body = trimmed.slice(at + 1, close);

    if (prelude.startsWith('@')) {
      const name = prelude.split(/\s/)[0]?.toLowerCase() ?? '';
      if (name === '@media' || name === '@supports' || name === '@container') {
        out += `${prelude}{\n${scopeCss(body, scopeSelector)}\n}\n`;
      } else {
        // @keyframes, @font-face, @import, @layer — leave as-is (sanitize later).
        out += `${prelude}{${body}}\n`;
      }
    } else {
      const selectors = prelude
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((sel) => {
          if (sel === ':root' || sel === 'html' || sel === 'body') {
            return scopeSelector;
          }
          return `${scopeSelector} ${sel}`;
        });
      out += `${selectors.join(', ')}{${body}}\n`;
    }

    i = close + 1;
  }

  return out;
}

function findMatchingBrace(src: string, openIdx: number): number {
  let depth = 0;
  for (let i = openIdx; i < src.length; i++) {
    const ch = src[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

export function htmlScopeClass(seed: string): string {
  const hash = createHash('sha1').update(seed).digest('hex').slice(0, 10);
  return `html-scope-${hash}`;
}

/**
 * Run the full paste pipeline for public render (and admin preview).
 */
export function processHtmlPaste(raw: string, options: HtmlPasteOptions): HtmlPasteResult {
  const isolate = options.isolate !== false;
  const { body, headCss } = unwrapHtmlDocument(raw);
  const embedded = extractStyleTagContents(body);
  const withoutStyles = stripStyleTags(body);

  const mode = options.mode;
  // <style> blocks are only kept in designer/trusted; safe strips them entirely.
  const allowCss = mode === 'designer' || mode === 'trusted';
  const combinedCss = allowCss ? [headCss, ...embedded].filter(Boolean).join('\n') : '';

  const scopeClass =
    isolate && combinedCss
      ? options.scopeId ?? htmlScopeClass(raw.slice(0, 2000))
      : isolate
        ? options.scopeId ?? htmlScopeClass(raw.slice(0, 2000))
        : null;

  let css = '';
  if (combinedCss) {
    const scoped = scopeClass ? scopeCss(combinedCss, `.${scopeClass}`) : combinedCss;
    css = sanitizeScopedCss(scoped);
  }

  const html = sanitizeHtmlForMode(withoutStyles, mode);
  return { html, css, scopeClass };
}

/** True when any html block asks the site shell to step aside. */
export function blocksRequestBlankChrome(
  blocks: ReadonlyArray<{ type: string; fullPage?: boolean }>
): boolean {
  return blocks.some((b) => b.type === 'html' && b.fullPage === true);
}
