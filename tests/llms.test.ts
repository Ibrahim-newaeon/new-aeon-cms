import { describe, it, expect } from 'vitest';
import { buildLlmsTxt, type LlmsInput } from '@/lib/seo/llms';

const NAMES: Record<string, string> = { ar: 'Arabic', en: 'English' };

const base = (over: Partial<LlmsInput> = {}): LlmsInput => ({
  name: 'New Aeon',
  answer: 'We are a perfume shop in Jordan. We sell oud with cash on delivery nationwide.',
  shop: true,
  primary: 'ar',
  others: ['en'],
  pages: new Set(['home', 'about-us']),
  country: 'Jordan',
  currency: 'JOD',
  contactPhone: '+962 7 9000 0000',
  whatsappNumber: '0791234567',
  contactEmail: 'store@example.com',
  social: { instagram: 'https://instagram.com/x', facebook: 'https://facebook.com/x' },
  allowAiCrawlers: true,
  url: (p) => `https://example.com${p}`,
  languageName: (c) => NAMES[c] ?? c,
  ...over,
});

/** Every markdown link target in the document. */
const links = (t: string) => [...t.matchAll(/\]\(([^)]+)\)/g)].map((m) => m[1]!);

describe('llms.txt', () => {
  it('follows the template', () => {
    const t = buildLlmsTxt(base());

    expect(t.startsWith('# New Aeon\n')).toBe(true);
    expect(t).toContain('> We are a perfume shop in Jordan.');
    expect(t).toContain(
      'This site is the official store. Primary language: Arabic. Also available in English.'
    );

    // Headings in order, not merely present.
    const order = ['## Site', '## English', '## Facts for citation'];
    const at = order.map((h) => t.indexOf(h));
    expect(at.every((n) => n > -1), `missing one of ${order.join(', ')}`).toBe(true);
    expect(at).toEqual([...at].sort((a, b) => a - b));

    for (const fact of ['- Brand: New Aeon', '- Country: Jordan', '- Currency: JOD',
      '- Payment: Cash on delivery (COD)', '- Languages: Arabic, English']) {
      expect(t).toContain(fact);
    }
  });

  it('links the real slug rather than the conventional one', () => {
    // The template's example is /about; this catalogue's page is about-us.
    // Advertising a slug that does not exist teaches a model the site 404s.
    const t = buildLlmsTxt(base());
    expect(t).toContain('/ar/about-us)');
    expect(t).not.toContain('/ar/about)');
  });

  it('omits a section entirely rather than linking a page that does not exist', () => {
    const t = buildLlmsTxt(base({ pages: new Set(['home']) }));
    expect(t).not.toContain('About');
    expect(t).not.toContain('Contact');
    expect(t).not.toContain('Shipping');
    // …while everything that does exist is still there.
    expect(t).toContain('## Site');
    expect(t).toContain('/ar/shop)');
  });

  it('never advertises an unpublished policy', () => {
    // The rule this whole file exists for. Drafts are absent from `pages`, so
    // the Optional section must not appear at all.
    const t = buildLlmsTxt(base());
    expect(t).not.toContain('## Optional');
    expect(t).not.toContain('privacy-policy');
    expect(t).not.toContain('returns-and-refunds');
  });

  it('advertises a policy once it is published', () => {
    const t = buildLlmsTxt(
      base({ pages: new Set(['about-us', 'privacy-policy', 'returns-and-refunds']) })
    );
    expect(t).toContain('## Optional');
    expect(t).toContain('- [Privacy](https://example.com/ar/privacy-policy)');
    expect(t).toContain('- [Returns](https://example.com/ar/returns-and-refunds)');
    // Not yet written, so still absent.
    expect(t).not.toContain('Terms]');
  });

  it('drops the shop entirely when commerce is off', () => {
    const t = buildLlmsTxt(base({ shop: false }));
    expect(t).not.toContain('/shop');
    // Currency and payment describe a shop, so they go with it.
    expect(t).not.toContain('- Currency:');
    expect(t).not.toContain('- Payment:');
  });

  it('omits the brand answer rather than inventing one', () => {
    for (const answer of [null, '', '   ']) {
      const t = buildLlmsTxt(base({ answer }));
      expect(t, JSON.stringify(answer)).not.toContain('\n> ');
      // The rest of the document still stands.
      expect(t).toContain('## Facts for citation');
    }
  });

  it('does not contradict robots.txt', () => {
    const welcoming = buildLlmsTxt(base({ allowAiCrawlers: true }));
    expect(welcoming).not.toContain('not to be used for AI training');

    const refusing = buildLlmsTxt(base({ allowAiCrawlers: false }));
    expect(refusing).toContain('not to be used for AI training');
  });

  it('handles a single-language site without a dangling sentence', () => {
    const t = buildLlmsTxt(base({ others: [] }));
    expect(t).toContain('Primary language: Arabic.');
    expect(t).not.toContain('Also available in .');
    expect(t).not.toContain('## English');
    expect(t).toContain('- Languages: Arabic');
  });

  it('every link it emits is absolute', () => {
    // A relative URL in a file read out of context resolves against nothing.
    const t = buildLlmsTxt(base({ pages: new Set(['about-us', 'privacy-policy']) }));
    const all = links(t);
    expect(all.length).toBeGreaterThan(4);
    for (const url of all) expect(url, url).toMatch(/^https:\/\/example\.com\//);
  });

  it('emits no empty social entry', () => {
    const t = buildLlmsTxt(base({ social: { instagram: 'https://x', tiktok: '  ' } }));
    expect(t).toContain('Instagram: https://x');
    expect(t).not.toContain('Tiktok');
  });
});
