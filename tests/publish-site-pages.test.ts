// tests/publish-al-ai-pages.test.ts
//
// Covers the two pure halves of the bulk publisher: the request body it builds
// and the manifest checks it runs before sending anything. Both are places
// where a mistake is silent — a body with the wrong field name is rejected by
// the block registry with a generic 400, and a bad slug is only discovered
// after the pages before it are already live.

import { describe, it, expect } from 'vitest';
import { blockArraySchema, contentPayloadSchema } from '@/lib/blocks/content-schema';
import { buildPayload, validateEntry, parseArgs } from '../scripts/publish-site-pages.mjs';

const entry = {
  file: 'about.html',
  slug: 'about',
  type: 'page',
  title: 'About Us',
  metaDescription: '',
};

const opts = { locale: 'en' as const, status: 'published' as const };

describe('publish-al-ai-pages payload', () => {
  /**
   * The API validates with this exact schema, so asserting against it is the
   * real check — a hand-written expectation would pass while the server 400s.
   */
  it('builds a body the content API accepts', () => {
    const payload = buildPayload(entry, '<section>Hi</section>', opts);
    expect(() => contentPayloadSchema.parse(payload)).not.toThrow();
  });

  /**
   * The html block's field is `content`. `html` parses as an unknown key.
   *
   * `isolate: false` rides along: a migrated fragment carries no <style> of its
   * own, so the default scoping has nothing to scope and leaves only a wrapper
   * div that a direct-child selector stops matching through.
   */
  it('puts the markup in the html block content field, unisolated', () => {
    const payload = buildPayload(entry, '<section>Hi</section>', opts);
    const parsed = contentPayloadSchema.parse(payload);
    expect(blockArraySchema.parse(parsed.translations[0]?.body)).toEqual([
      { type: 'html', content: '<section>Hi</section>', isolate: false },
    ]);
  });

  it('carries the requested locale and status through', () => {
    const payload = buildPayload(entry, '<p>x</p>', { locale: 'ar', status: 'draft' });
    expect(payload.status).toBe('draft');
    expect(payload.translations[0]?.locale).toBe('ar');
  });

  it('keeps a description that fits', () => {
    const payload = buildPayload({ ...entry, metaDescription: '  Clean data  ' }, '<p>x</p>', opts);
    expect(payload.translations[0]?.metaDescription).toBe('Clean data');
  });

  /**
   * translationSchema caps metaDescription at 500. Sending a longer one fails
   * the whole page; dropping it costs a meta tag and publishes the content.
   */
  it('drops an over-long description rather than failing the page', () => {
    const payload = buildPayload({ ...entry, metaDescription: 'x'.repeat(501) }, '<p>x</p>', opts);
    expect(payload.translations[0]).not.toHaveProperty('metaDescription');
    expect(() => contentPayloadSchema.parse(payload)).not.toThrow();
  });

  it('omits a description that is only whitespace', () => {
    const payload = buildPayload({ ...entry, metaDescription: '   ' }, '<p>x</p>', opts);
    expect(payload.translations[0]).not.toHaveProperty('metaDescription');
  });
});

describe('publish-al-ai-pages manifest checks', () => {
  it('passes a well-formed entry', () => {
    expect(validateEntry(entry)).toEqual([]);
  });

  /** contentPayloadSchema's slug regex; an uppercase slug 400s per page. */
  it('rejects a slug the API would refuse', () => {
    expect(validateEntry({ ...entry, slug: 'Agentic-AI' })).toHaveLength(1);
    expect(validateEntry({ ...entry, slug: 'trailing-' })).toHaveLength(1);
    expect(validateEntry({ ...entry, slug: '' })).toHaveLength(1);
  });

  it('rejects an empty title, which is what a missing <title> yields', () => {
    expect(validateEntry({ ...entry, title: '   ' })).toHaveLength(1);
  });

  it('rejects an entry naming something other than an html file', () => {
    expect(validateEntry({ ...entry, file: 'about' })).toHaveLength(1);
  });

  /** A warning, not a blocker: buildPayload drops it and the page still goes. */
  it('warns about an over-long description without blocking it', () => {
    const problems = validateEntry({ ...entry, metaDescription: 'x'.repeat(501) });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('will be left unset');
  });
});

describe('publish-al-ai-pages arguments', () => {
  it('defaults to published English against no server', () => {
    expect(parseArgs([])).toEqual({
      url: null,
      dir: null,
      locale: 'en',
      status: 'published',
      dryRun: false,
      only: [],
      split: false,
    });
  });

  it('reads --only as a slug list', () => {
    expect(parseArgs(['--only', 'home, about ,contact']).only).toEqual(['home', 'about', 'contact']);
  });

  it('takes no password: credentials come from the environment', () => {
    expect(Object.keys(parseArgs(['--url', 'https://x.test']))).not.toContain('password');
  });
});

describe('a manifest entry carrying its own blocks', () => {
  const faqEntry = {
    slug: 'faq',
    type: 'page',
    title: 'FAQ',
    blocks: [{ type: 'faq', items: [{ question: 'Q?', answer: 'A.' }] }],
  };

  /**
   * The reason this exists: a `faq` block is what produces FAQPage schema and
   * what a pack renders through its own partial. Without this the only way to
   * create one is to retype every question into the admin, which is not a
   * thing anyone does twice.
   */
  it('uses the blocks verbatim instead of the html file', () => {
    const payload = buildPayload(faqEntry, '<p>ignored</p>', opts);
    expect(payload.translations[0]?.body).toEqual(faqEntry.blocks);
  });

  it('still produces a body the content API accepts', () => {
    expect(() => contentPayloadSchema.parse(buildPayload(faqEntry, '', opts))).not.toThrow();
  });

  it('needs no file on such an entry', () => {
    expect(validateEntry({ ...faqEntry })).toEqual([]);
  });

  /** An empty array would publish a page with no content at all. */
  it('refuses an empty blocks array', () => {
    expect(validateEntry({ ...faqEntry, blocks: [] })).toHaveLength(1);
  });

  /** The renderer switches on `type`; an entry without one renders as nothing. */
  it('refuses a block with no type', () => {
    expect(validateEntry({ ...faqEntry, blocks: [{ items: [] }] })).toHaveLength(1);
  });

  it('still requires a file when no blocks are given', () => {
    expect(validateEntry({ slug: 'x', type: 'page', title: 'X' })).toHaveLength(1);
  });

  it('leaves the html path alone', () => {
    const payload = buildPayload(entry, '<section>Hi</section>', opts);
    expect(payload.translations[0]?.body).toEqual([
      { type: 'html', content: '<section>Hi</section>', isolate: false },
    ]);
  });
});
