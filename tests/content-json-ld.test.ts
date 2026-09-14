// tests/content-json-ld.test.ts
//
// Content pages published nothing machine-readable: no Article, no WebPage, no
// breadcrumb. A search engine saw a title tag and a wall of markup, and an
// answer engine had nothing to attribute a claim to — the same pages the
// product route has emitted structured data for all along.
//
// These assert the shape the engines read, and the two details that decide
// whether a page is treated as a source rather than a copy: a stable @id and a
// dateModified that does not vanish when a page has never been edited.

import { describe, it, expect } from 'vitest';
import { contentPageJsonLd, breadcrumbJsonLd } from '@/lib/seo/json-ld';

const base = {
  path: '/en/about',
  title: 'About Us',
  locale: 'en',
} as const;

describe('contentPageJsonLd', () => {
  it('types a page as WebPage and a post as Article', () => {
    expect(contentPageJsonLd({ ...base, kind: 'page' })['@type']).toBe('WebPage');
    expect(contentPageJsonLd({ ...base, kind: 'article' })['@type']).toBe('Article');
  });

  /** Article is read for `headline`, WebPage for `name`. */
  it('names the page by the property its type is read for', () => {
    expect(contentPageJsonLd({ ...base, kind: 'article' }).headline).toBe('About Us');
    expect(contentPageJsonLd({ ...base, kind: 'page' }).name).toBe('About Us');
  });

  /** The identity an answer engine deduplicates on. */
  it('carries an absolute @id, url and mainEntityOfPage that agree', () => {
    const node = contentPageJsonLd({ ...base, kind: 'page' });
    expect(node['@id']).toMatch(/^https?:\/\/.+\/en\/about$/);
    expect(node.url).toBe(node['@id']);
    expect(node.mainEntityOfPage).toEqual({ '@type': 'WebPage', '@id': node['@id'] });
  });

  it('declares the language', () => {
    expect(contentPageJsonLd({ ...base, kind: 'page', locale: 'ar' }).inLanguage).toBe('ar');
  });

  /**
   * A page that has never been edited still needs a dateModified — it is what
   * an engine reads to decide the claim is current. Falling back to the
   * publication date is accurate; omitting it reads as unknown age.
   */
  it('falls back to the publication date for dateModified', () => {
    const node = contentPageJsonLd({
      ...base,
      kind: 'article',
      publishedAt: new Date('2026-01-02T03:04:05Z'),
    });
    expect(node.datePublished).toBe('2026-01-02T03:04:05.000Z');
    expect(node.dateModified).toBe('2026-01-02T03:04:05.000Z');
  });

  it('prefers a real modification date when there is one', () => {
    const node = contentPageJsonLd({
      ...base,
      kind: 'article',
      publishedAt: '2026-01-02T00:00:00Z',
      updatedAt: '2026-03-04T00:00:00Z',
    });
    expect(node.dateModified).toBe('2026-03-04T00:00:00.000Z');
  });

  /** An invalid date must not become "Invalid Date" in the output. */
  it('omits a date it cannot parse rather than emitting nonsense', () => {
    const node = contentPageJsonLd({ ...base, kind: 'page', publishedAt: 'not a date' });
    expect(node).not.toHaveProperty('datePublished');
    expect(node).not.toHaveProperty('dateModified');
  });

  it('absolutises a site-relative image', () => {
    const node = contentPageJsonLd({ ...base, kind: 'page', image: '/uploads/2026/09/a.png' });
    expect(node.image).toMatch(/^https?:\/\/.+\/uploads\/2026\/09\/a\.png$/);
  });

  it('attributes the page to the site as publisher', () => {
    const node = contentPageJsonLd({
      ...base,
      kind: 'article',
      publisher: { name: 'al-ai.ai', logo: '/logo.png' },
    }) as { publisher: { '@type': string; name: string; logo: { url: string } } };
    expect(node.publisher['@type']).toBe('Organization');
    expect(node.publisher.name).toBe('al-ai.ai');
    expect(node.publisher.logo.url).toMatch(/^https?:\/\/.+\/logo\.png$/);
  });

  /** Absent is better than empty: an empty string is a claim that it has none. */
  it('omits what it was not given', () => {
    const node = contentPageJsonLd({ ...base, kind: 'page' });
    expect(node).not.toHaveProperty('description');
    expect(node).not.toHaveProperty('image');
    expect(node).not.toHaveProperty('publisher');
  });
});

describe('breadcrumbJsonLd on a content page', () => {
  it('numbers the trail from one and absolutises each step', () => {
    const node = breadcrumbJsonLd([
      { name: 'al-ai.ai', path: '/en' },
      { name: 'About Us', path: '/en/about' },
    ]) as { itemListElement: { position: number; name: string; item: string }[] };

    expect(node.itemListElement.map((s) => s.position)).toEqual([1, 2]);
    expect(node.itemListElement[1]?.item).toMatch(/\/en\/about$/);
  });
});
