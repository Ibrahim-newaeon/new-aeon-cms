// tests/seo-metadata.test.ts
import { describe, it, expect } from 'vitest';
import { buildMetadata } from '@/lib/seo/metadata';

const base = { locale: 'en' as const, path: '/shop', title: 'Shop' };

describe('buildMetadata', () => {
  it('gives every page a canonical', () => {
    // Without one, /ar and /en of the same page, plus every filter
    // combination, compete as separate URLs.
    expect(buildMetadata(base).alternates?.canonical).toMatch(/\/en\/shop$/);
  });

  it('lists every locale as an alternate, plus x-default', () => {
    const langs = buildMetadata(base).alternates?.languages as Record<string, string>;
    expect(Object.keys(langs).sort()).toEqual(['ar', 'en', 'x-default']);
    expect(langs.ar).toMatch(/\/ar\/shop$/);
  });

  it('emits the Open Graph fields a share actually renders', () => {
    // og:image alone produced a bare URL on WhatsApp, which is how this
    // shop's links travel.
    const og = buildMetadata({ ...base, description: 'Oud and perfume.', siteName: 'New Aeon' })
      .openGraph as Record<string, unknown>;
    expect(og.title).toBe('Shop');
    expect(og.description).toBe('Oud and perfume.');
    expect(og.url).toMatch(/\/en\/shop$/);
    expect(og.siteName).toBe('New Aeon');
    expect(og.locale).toBe('en_GB');
    expect(og.alternateLocale).toEqual(['ar_JO']);
  });

  it('uses the large Twitter card only when there is an image', () => {
    // The large card with no picture renders worse than the small one.
    expect((buildMetadata(base).twitter as Record<string, unknown>).card).toBe('summary');
    expect(
      (buildMetadata({ ...base, image: '/x.webp' }).twitter as Record<string, unknown>).card
    ).toBe('summary_large_image');
  });

  it('makes a relative image absolute', () => {
    const og = buildMetadata({ ...base, image: '/uploads/a.webp' }).openGraph as {
      images?: { url: string }[];
    };
    expect(og.images?.[0]?.url).toMatch(/^https?:\/\/.+\/uploads\/a\.webp$/);
  });

  it('honours noIndex without dropping the canonical', () => {
    const meta = buildMetadata({ ...base, noIndex: true });
    expect(meta.robots).toMatchObject({ index: false });
    expect(meta.alternates?.canonical).toBeTruthy();
  });

  it('handles the home path, which has no segment', () => {
    expect(buildMetadata({ locale: 'ar', path: '', title: 'X' }).alternates?.canonical)
      .toMatch(/\/ar$/);
  });
});
