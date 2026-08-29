import { describe, it, expect } from 'vitest';
import { tagSchema, categorySchema, slugSchema, slugify } from '@/lib/taxonomy-schema';

describe('slugSchema', () => {
  it('accepts lowercase words joined by single hyphens', () => {
    for (const s of ['tag', 'perfume-care', 'a1', 'a-1-b']) {
      expect(slugSchema.safeParse(s).success, s).toBe(true);
    }
  });

  it('rejects uppercase, spaces, double hyphens and edge hyphens', () => {
    for (const s of ['Tag', 'two words', 'a--b', '-lead', 'trail-', '', 'عربي']) {
      expect(slugSchema.safeParse(s).success, s).toBe(false);
    }
  });
});

describe('tagSchema', () => {
  const base = { name: 'Perfume Care', slug: 'perfume-care' };

  it('requires a reference name — a tag must never render blank', () => {
    expect(tagSchema.safeParse({ ...base, name: '' }).success).toBe(false);
    expect(tagSchema.safeParse({ ...base, name: '   ' }).success).toBe(false);
  });

  it('accepts a tag with no translations at all', () => {
    // Requiring one would break every pre-existing single-name tag on its next
    // save, which is why this is optional where categorySchema's is not.
    expect(tagSchema.safeParse(base).success).toBe(true);
  });

  it('accepts translations for both locales', () => {
    const parsed = tagSchema.safeParse({
      ...base,
      translations: [
        { locale: 'ar', name: 'العناية بالعطور' },
        { locale: 'en', name: 'Perfume Care' },
      ],
    });
    expect(parsed.success).toBe(true);
  });

  it('ALLOWS a blank translation name — that is how one is removed', () => {
    // The removal path in setTagTranslations deletes the row for a blank name.
    // With min(1) here that path was unreachable and a wrong translation could
    // never be taken back, which is exactly what happened the first time.
    const parsed = tagSchema.safeParse({
      ...base,
      translations: [{ locale: 'en', name: '' }],
    });
    expect(parsed.success).toBe(true);
  });

  it('still rejects an unknown locale', () => {
    const parsed = tagSchema.safeParse({
      ...base,
      translations: [{ locale: 'fr', name: 'Parfum' }],
    });
    expect(parsed.success).toBe(false);
  });

  it('trims translation names', () => {
    const parsed = tagSchema.parse({
      ...base,
      translations: [{ locale: 'ar', name: '  عطور  ' }],
    });
    expect(parsed.translations?.[0]!.name).toBe('عطور');
  });

  it('caps a translation name at 255 characters', () => {
    const parsed = tagSchema.safeParse({
      ...base,
      translations: [{ locale: 'ar', name: 'x'.repeat(256) }],
    });
    expect(parsed.success).toBe(false);
  });
});

describe('categorySchema', () => {
  it('requires at least one translation, unlike tags', () => {
    // A category has no reference name to fall back to, so it genuinely needs
    // one. The asymmetry with tagSchema is deliberate.
    const parsed = categorySchema.safeParse({ slug: 'x', translations: [] });
    expect(parsed.success).toBe(false);
  });

  it('accepts one locale only', () => {
    const parsed = categorySchema.safeParse({
      slug: 'perfumes',
      translations: [{ locale: 'ar', name: 'عطور' }],
    });
    expect(parsed.success).toBe(true);
  });
});

describe('slugify', () => {
  it('lowercases and hyphenates Latin text', () => {
    expect(slugify('Perfume Care')).toBe('perfume-care');
    expect(slugify('  Two   Words  ')).toBe('two-words');
  });

  it('collapses repeated hyphens and trims edge ones', () => {
    expect(slugify('a -- b')).toBe('a-b');
    expect(slugify('-lead and trail-')).toBe('lead-and-trail');
  });

  it('yields an empty string for Arabic-only input', () => {
    // Deliberate: there is no transliteration here, so the author has to type a
    // slug rather than get a silently wrong one.
    expect(slugify('العناية بالعطور')).toBe('');
  });

  it('produces output that satisfies slugSchema', () => {
    for (const input of ['Perfume Care', 'A -- B', 'Hello World 2026']) {
      expect(slugSchema.safeParse(slugify(input)).success, input).toBe(true);
    }
  });
});
