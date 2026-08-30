// tests/type-registry.test.ts
import { describe, it, expect } from 'vitest';
import {
  prefixProblem, normalisePrefix, PREFIX_PATTERN, RESERVED_PREFIXES, isBuiltInType,
} from '@/lib/content/type-registry';
import { CONTENT_TYPE_SLUGS } from '@/lib/content/content-types';

const LOCALES = ['ar', 'en'];

describe('prefixProblem', () => {
  it('accepts an ordinary new prefix', () => {
    expect(prefixProblem('case-studies', LOCALES)).toBeNull();
  });

  it('refuses a prefix that an existing route already owns', () => {
    // Next resolves a static segment ahead of a dynamic one, so a type at
    // "shop" would not break the store — it would silently never resolve, and
    // the editor would wonder where their pages went.
    for (const taken of RESERVED_PREFIXES) {
      expect(prefixProblem(taken, LOCALES), taken).toEqual({ kind: 'reserved', word: taken });
    }
  });

  it('refuses the built-in type slugs', () => {
    for (const slug of CONTENT_TYPE_SLUGS) {
      expect(prefixProblem(slug, LOCALES), slug).toMatchObject({ kind: 'reserved' });
    }
  });

  it('refuses a locale, which would produce /ar/ar/thing', () => {
    expect(prefixProblem('ar', LOCALES)).toEqual({ kind: 'locale' });
    expect(prefixProblem('en', LOCALES)).toEqual({ kind: 'locale' });
  });

  it('refuses system words that would look like part of the platform', () => {
    for (const word of ['api', 'admin', 'uploads', 'static']) {
      expect(prefixProblem(word, LOCALES), word).toMatchObject({ kind: 'reserved' });
    }
    // `_next` and the file-like ones cannot pass the slug shape either way;
    // what matters is that they are refused, not which rule catches them.
    for (const word of ['_next', 'sitemap.xml', 'robots.txt']) {
      expect(prefixProblem(word, LOCALES), word).not.toBeNull();
    }
  });

  it('names the prefix another type already uses', () => {
    expect(prefixProblem('guides', LOCALES, ['guides'])).toEqual({ kind: 'taken', word: 'guides' });
  });

  it('requires a slug shape, since this becomes a URL segment', () => {
    for (const bad of ['Case Studies', 'case_studies', 'case studies', '-a', 'a-', 'a--b', 'حالات']) {
      expect(prefixProblem(bad, LOCALES), JSON.stringify(bad)).toMatchObject({ kind: 'shape' });
    }
  });

  it('reports empty and over-long separately, so the message can be useful', () => {
    expect(prefixProblem('   ', LOCALES)).toEqual({ kind: 'empty' });
    expect(prefixProblem('a'.repeat(65), LOCALES)).toEqual({ kind: 'tooLong' });
  });

  it('is case-insensitive about what is reserved', () => {
    // Otherwise "Shop" sails past the reserved list and lands on a dead route.
    expect(prefixProblem('SHOP', LOCALES)).toMatchObject({ kind: 'reserved' });
  });

  it('normalises what it validates, and says so', () => {
    /**
     * Validation lowercases before checking, so `Case-Studies` is accepted.
     * Storing the raw value would then give a type whose prefix never matches
     * a URL — the route arrives lowercase. Callers must store
     * normalisePrefix(), and this is the test that keeps the two in step.
     */
    expect(prefixProblem('Case-Studies', LOCALES)).toBeNull();
    expect(normalisePrefix('  Case-Studies  ')).toBe('case-studies');
    expect(PREFIX_PATTERN.test(normalisePrefix('Case-Studies'))).toBe(true);
  });
});

describe('RESERVED_PREFIXES', () => {
  it('lists every real route segment under /[locale]', () => {
    // This list is only as good as its agreement with the filesystem. If a
    // route is added under app/(site)/[locale] and not added here, a content
    // type can claim it and silently never resolve.
    for (const seg of ['shop', 'products', 'cart', 'checkout', 'search', 'blog', 'resources', 'category', 'tag', 'order', 'bundles']) {
      expect(RESERVED_PREFIXES, seg).toContain(seg);
    }
  });
});

describe('isBuiltInType', () => {
  it('knows the three types that own their own admin screens', () => {
    expect(isBuiltInType('page')).toBe(true);
    expect(isBuiltInType('post')).toBe(true);
    expect(isBuiltInType('resource')).toBe(true);
    expect(isBuiltInType('case-study')).toBe(false);
  });
});
