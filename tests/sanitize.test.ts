import { describe, it, expect } from 'vitest';
import { sanitizeRichHtml, sanitizeHtmlForMode, sanitizeScopedCss } from '@/lib/blocks/sanitize';
import {
  unwrapHtmlDocument,
  scopeCss,
  processHtmlPaste,
  blocksRequestBlankChrome,
  extractStyleTagContents,
  stripStyleTags,
} from '@/lib/blocks/html-paste';
import { themeDriverSchema, isThemeDriverImplemented } from '@/lib/theme/driver';
import { settingsSchema } from '@/lib/settings-schema';

/**
 * This is the only thing between a stored `<script>` and every visitor to a
 * published page. The `html` block once rendered with a bare
 * dangerouslySetInnerHTML under a comment claiming it was sanitized, so these
 * are regression tests for a vulnerability that actually shipped.
 */
describe('sanitizeRichHtml', () => {
  it('strips script tags and their contents', () => {
    const out = sanitizeRichHtml('<p>hi</p><script>alert(1)</script>');
    expect(out).not.toContain('<script');
    expect(out).not.toContain('alert(1)');
    expect(out).toContain('<p>hi</p>');
  });

  it('strips event handler attributes', () => {
    for (const html of [
      '<p onclick="alert(1)">x</p>',
      '<img src="/a.png" onerror="alert(1)">',
      '<div onmouseover="alert(1)">x</div>',
      '<a href="/x" onfocus="alert(1)">x</a>',
    ]) {
      const out = sanitizeRichHtml(html);
      expect(out, `for ${html}`).not.toMatch(/on\w+\s*=/i);
      expect(out).not.toContain('alert(1)');
    }
  });

  it('drops javascript: and data: hrefs', () => {
    for (const href of [
      'javascript:alert(1)',
      'JaVaScRiPt:alert(1)',
      'javascript:void(0)',
      'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
      'vbscript:msgbox(1)',
    ]) {
      const out = sanitizeRichHtml(`<a href="${href}">click</a>`);
      expect(out.toLowerCase(), `for ${href}`).not.toContain('javascript:');
      expect(out.toLowerCase()).not.toContain('vbscript:');
      expect(out.toLowerCase()).not.toContain('data:text/html');
    }
  });

  it('keeps the safe schemes an editor actually needs', () => {
    expect(sanitizeRichHtml('<a href="https://example.com">x</a>')).toContain('https://example.com');
    expect(sanitizeRichHtml('<a href="mailto:a@b.com">x</a>')).toContain('mailto:a@b.com');
    expect(sanitizeRichHtml('<a href="tel:+962791234567">x</a>')).toContain('tel:+962791234567');
  });

  it('keeps relative URLs, which are same-origin uploads', () => {
    expect(sanitizeRichHtml('<img src="/uploads/2026/08/x.png">')).toContain('/uploads/2026/08/x.png');
    expect(sanitizeRichHtml('<a href="/ar/about-us">x</a>')).toContain('/ar/about-us');
  });

  it('adds noopener noreferrer to any link that opens a new tab', () => {
    const out = sanitizeRichHtml('<a href="https://example.com" target="_blank">x</a>');
    expect(out).toContain('rel="noopener noreferrer"');
  });

  it('strips style attributes', () => {
    const out = sanitizeRichHtml('<p style="background:url(javascript:alert(1))">x</p>');
    expect(out).not.toContain('style=');
  });

  it('strips iframe, object, embed, form and svg', () => {
    for (const tag of ['iframe', 'object', 'embed', 'form', 'svg']) {
      const out = sanitizeRichHtml(`<${tag}></${tag}><p>keep</p>`);
      expect(out, `for <${tag}>`).not.toContain(`<${tag}`);
      expect(out).toContain('keep');
    }
  });

  it('preserves the formatting an editor is expected to use', () => {
    const html =
      '<h2>Title</h2><p><strong>bold</strong> <em>italic</em></p><ul><li>one</li></ul>' +
      '<blockquote>quoted</blockquote><table><tr><td>cell</td></tr></table>';
    const out = sanitizeRichHtml(html);

    for (const fragment of ['<h2>', '<strong>', '<em>', '<ul>', '<li>', '<blockquote>', '<td>']) {
      expect(out, `expected ${fragment}`).toContain(fragment);
    }
  });

  it('keeps dir and lang, which bilingual content depends on', () => {
    const out = sanitizeRichHtml('<p dir="rtl" lang="ar">مرحباً</p>');
    expect(out).toContain('dir="rtl"');
    expect(out).toContain('lang="ar"');
    expect(out).toContain('مرحباً');
  });

  it('is idempotent', () => {
    const once = sanitizeRichHtml('<p onclick="x()">hi</p><script>y()</script>');
    expect(sanitizeRichHtml(once)).toBe(once);
  });

  it('handles empty and malformed input without throwing', () => {
    expect(sanitizeRichHtml('')).toBe('');
    expect(() => sanitizeRichHtml('<p><div><span>unclosed')).not.toThrow();
  });
});

describe('sanitizeHtmlForMode (paste tiers)', () => {
  it('safe still strips class and style', () => {
    const out = sanitizeHtmlForMode(
      '<section class="hero" style="color:red"><p>x</p></section>',
      'safe'
    );
    expect(out).not.toContain('section');
    expect(out).not.toContain('class=');
    expect(out).not.toContain('style=');
    expect(out).toContain('<p>x</p>');
  });

  it('designer keeps section, class and colour styles', () => {
    const out = sanitizeHtmlForMode(
      '<section class="hero" style="color:#112233"><p>x</p></section>',
      'designer'
    );
    expect(out).toContain('<section');
    expect(out).toContain('class="hero"');
    expect(out).toContain('color:#112233');
  });

  it('trusted still never allows script', () => {
    const out = sanitizeHtmlForMode('<p>ok</p><script>alert(1)</script>', 'trusted');
    expect(out).not.toContain('<script');
    expect(out).not.toContain('alert(1)');
  });
});

describe('html paste pipeline', () => {
  it('unwraps a full HTML document to body contents', () => {
    const { body, headCss } = unwrapHtmlDocument(
      '<!doctype html><html><head><style>.a{color:red}</style></head><body><h1>Hi</h1></body></html>'
    );
    expect(body).toContain('<h1>Hi</h1>');
    expect(headCss).toContain('.a{color:red}');
  });

  it('scopes CSS under a selector and remaps body/html', () => {
    const css = scopeCss('body { color: red } .card { padding: 1rem }', '.html-scope-x');
    expect(css).toContain('.html-scope-x{');
    expect(css).toContain('.html-scope-x .card{');
    expect(css).not.toMatch(/(^|[,{]\s*)body\s*\{/);
  });

  it('extracts and strips style tags', () => {
    const raw = '<style>.x{}</style><p>y</p><style>.z{}</style>';
    expect(extractStyleTagContents(raw)).toEqual(['.x{}', '.z{}']);
    expect(stripStyleTags(raw)).toBe('<p>y</p>');
  });

  it('processHtmlPaste scopes designer CSS and drops scripts', () => {
    const result = processHtmlPaste(
      '<style>.hero{color:red}</style><section class="hero"><p>Hi<script>bad()</script></p></section>',
      { mode: 'designer', isolate: true, scopeId: 'html-scope-test' }
    );
    expect(result.scopeClass).toBe('html-scope-test');
    expect(result.css).toContain('.html-scope-test .hero');
    expect(result.html).toContain('class="hero"');
    expect(result.html).not.toContain('script');
    expect(result.html).not.toContain('bad()');
  });

  it('safe mode drops extracted CSS entirely', () => {
    const result = processHtmlPaste('<style>.x{color:red}</style><p>y</p>', {
      mode: 'safe',
      isolate: true,
    });
    expect(result.css).toBe('');
    expect(result.html).toContain('<p>y</p>');
  });

  it('blocksRequestBlankChrome reads fullPage on html blocks', () => {
    expect(blocksRequestBlankChrome([{ type: 'paragraph' }])).toBe(false);
    expect(blocksRequestBlankChrome([{ type: 'html', fullPage: true }])).toBe(true);
    expect(blocksRequestBlankChrome([{ type: 'html', fullPage: false }])).toBe(false);
  });

  it('sanitizeScopedCss strips @import and style breakouts', () => {
    expect(sanitizeScopedCss('@import url("https://evil.test/x.css"); .a{}')).not.toContain('@import');
    expect(sanitizeScopedCss('</style><script>x</script>')).not.toMatch(/<\/?\s*style/i);
  });
});

describe('theme driver foundation', () => {
  it('accepts builtin and rejects unimplemented html-pack at settings boundary', () => {
    expect(themeDriverSchema.parse('builtin')).toBe('builtin');
    expect(isThemeDriverImplemented('builtin')).toBe(true);
    expect(isThemeDriverImplemented('html-pack')).toBe(false);

    const base = {
      siteName: 'Shop',
      comingSoonMode: false,
      eCommerceEnabled: false,
      currency: 'JOD',
    };
    expect(settingsSchema.parse({ ...base, themeDriver: 'builtin' }).themeDriver).toBe('builtin');
    expect(settingsSchema.safeParse({ ...base, themeDriver: 'html-pack' }).success).toBe(false);
  });

  it('defaults htmlPasteMode to safe', () => {
    const parsed = settingsSchema.parse({
      siteName: 'Shop',
      comingSoonMode: false,
      eCommerceEnabled: false,
      currency: 'JOD',
    });
    expect(parsed.htmlPasteMode).toBe('safe');
    expect(parsed.themeDriver).toBe('builtin');
  });
});
