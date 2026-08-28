import { describe, it, expect } from 'vitest';
import { esc, layout, row, table, textBlock } from '@/lib/email/render';

/**
 * Mail clients render HTML, so an unescaped `<` in a customer's name is the
 * same injection problem it is on a web page — and here the target is the shop
 * owner's own inbox, fed by a public unauthenticated form endpoint.
 */
describe('esc', () => {
  it('escapes every character that could break out of markup', () => {
    expect(esc('<script>')).toBe('&lt;script&gt;');
    expect(esc('a & b')).toBe('a &amp; b');
    expect(esc('"quoted"')).toBe('&quot;quoted&quot;');
    expect(esc("it's")).toBe('it&#39;s');
  });

  it('escapes the ampersand first, so entities are not double-decoded', () => {
    // Escaping < before & would turn `&lt;` into `&amp;lt;` on a second pass;
    // getting the order wrong the other way yields markup that decodes back to
    // a live tag in some clients.
    expect(esc('&lt;script&gt;')).toBe('&amp;lt;script&amp;gt;');
  });

  it('neutralises a real injection attempt', () => {
    const out = esc('<img src=x onerror=alert(1)>');
    expect(out).not.toContain('<img');
    expect(out).not.toContain('onerror=alert(1)>');
  });

  it('renders null and undefined as empty rather than the words', () => {
    expect(esc(null)).toBe('');
    expect(esc(undefined)).toBe('');
  });

  it('leaves Arabic untouched', () => {
    expect(esc('إبراهيم')).toBe('إبراهيم');
  });

  it('stringifies non-strings', () => {
    expect(esc(42)).toBe('42');
    expect(esc(0)).toBe('0');
    expect(esc(false)).toBe('false');
  });
});

describe('layout', () => {
  const base = { title: 'T', body: '<p>b</p>' } as const;

  it('sets RTL and the Arabic language for ar', () => {
    const html = layout({ ...base, locale: 'ar' });
    expect(html).toContain('dir="rtl"');
    expect(html).toContain('lang="ar"');
  });

  it('sets LTR for en', () => {
    const html = layout({ ...base, locale: 'en' });
    expect(html).toContain('dir="ltr"');
    expect(html).toContain('lang="en"');
  });

  it('escapes the title, which can carry a store or customer name', () => {
    const html = layout({ ...base, locale: 'en', title: '<script>x</script>' });
    expect(html).not.toContain('<script>x');
    expect(html).toContain('&lt;script&gt;');
  });

  it('escapes intro and footer too', () => {
    const html = layout({
      ...base,
      locale: 'en',
      intro: '<b>intro</b>',
      footer: '<b>footer</b>',
    });
    expect(html).not.toContain('<b>intro</b>');
    expect(html).not.toContain('<b>footer</b>');
  });

  it('passes the body through unescaped, since callers compose escaped markup', () => {
    expect(layout({ ...base, locale: 'en', body: '<p>hello</p>' })).toContain('<p>hello</p>');
  });

  it('omits the intro and footer blocks entirely when not given', () => {
    const html = layout({ ...base, locale: 'en' });
    expect(html).not.toContain('undefined');
    expect(html).not.toContain('null');
  });

  it('produces a complete document with a charset', () => {
    const html = layout({ ...base, locale: 'ar' });
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('charset="utf-8"');
    expect(html).toContain('</html>');
  });

  it('uses tables rather than flex, which Outlook cannot render', () => {
    const html = layout({ ...base, locale: 'en' });
    expect(html).toContain('role="presentation"');
    expect(html).not.toContain('display:flex');
  });
});

describe('row / table / textBlock', () => {
  it('escapes the label but trusts the value, which callers pre-escape', () => {
    expect(row('<b>L</b>', '<strong>V</strong>')).toContain('&lt;b&gt;L&lt;/b&gt;');
    expect(row('L', '<strong>V</strong>')).toContain('<strong>V</strong>');
  });

  it('marks a value LTR on request, so digits do not reorder inside RTL text', () => {
    expect(row('Phone', '0791234567', { ltr: true })).toContain('dir="ltr"');
    expect(row('Phone', '0791234567')).not.toContain('dir="ltr"');
  });

  it('wraps rows in a full-width presentation table', () => {
    expect(table(row('a', 'b'))).toContain('role="presentation"');
  });

  it('drops null and undefined lines but keeps deliberate blanks', () => {
    expect(textBlock(['a', null, 'b', undefined, '', 'c'])).toBe('a\nb\n\nc');
  });
});
