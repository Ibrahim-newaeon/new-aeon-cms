import { describe, it, expect } from 'vitest';
import { sanitizeRichHtml } from '@/lib/blocks/sanitize';

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
    // TipTap's generateHTML faithfully reproduces whatever href is in the
    // stored JSON, and that JSON is not trusted input.
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
    // Without it the opened page can navigate the opener via window.opener.
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
