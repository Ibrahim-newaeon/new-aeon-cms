// tests/home-metadata.test.ts
//
// The front page exported no generateMetadata, so it fell through to the
// layout's title template default — the bare site name — and to the site
// description. The metaTitle and metaDescription an editor set on the Home
// page were stored, shown in the admin, and read by nothing: a dead input on
// the most linked page of the site.
//
// These pin the fallback chain and the one case the template makes ugly.
// The route itself is a .tsx the unit tests cannot import, so the logic lives
// in lib/seo/home-metadata.ts and the route is a four-line wrapper.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const getContentBySlug = vi.fn();
const getSettings = vi.fn();

vi.mock('@/lib/db/queries', () => ({
  getContentBySlug: (...a: unknown[]) => getContentBySlug(...a),
  getSettings: () => getSettings(),
}));
vi.mock('@/lib/default-locale', () => ({ getDefaultLocale: async () => 'en' }));

const { homeMetadata } = await import('@/lib/seo/home-metadata');

const call = (locale: 'ar' | 'en' = 'en') => homeMetadata(locale);

beforeEach(() => {
  getContentBySlug.mockReset();
  getSettings.mockReset();
  getSettings.mockResolvedValue({ siteName: 'al-ai.ai', siteDescription: 'Site blurb.' });
});

describe('home generateMetadata', () => {
  it('uses the page own meta title and description', async () => {
    getContentBySlug.mockResolvedValue({
      content: {},
      i18n: { title: 'Home', metaTitle: 'Intelligent AI & Data Solutions', metaDescription: 'Smart AI solutions.' },
    });
    const meta = await call();
    expect(meta.title).toBe('Intelligent AI & Data Solutions');
    expect(meta.description).toBe('Smart AI solutions.');
    expect(meta.openGraph?.title).toBe('Intelligent AI & Data Solutions');
  });

  it('falls back to the page title, then the site description', async () => {
    getContentBySlug.mockResolvedValue({ content: {}, i18n: { title: 'Welcome' } });
    const meta = await call();
    expect(meta.title).toBe('Welcome');
    expect(meta.description).toBe('Site blurb.');
  });

  /** " · al-ai.ai" appended to "al-ai.ai" reads as a mistake, because it is. */
  it('does not let the template repeat the site name', async () => {
    getContentBySlug.mockResolvedValue(undefined);
    const meta = await call();
    expect(meta.title).toEqual({ absolute: 'al-ai.ai' });
  });

  it('canonicalises the locale root, not a slug', async () => {
    getContentBySlug.mockResolvedValue({ content: {}, i18n: { title: 'Home' } });
    const meta = await call('ar');
    expect(String(meta.alternates?.canonical)).toMatch(/\/ar$/);
  });

  /** The site is what is shared, not an article someone wrote on a date. */
  it('opens the graph as a website', async () => {
    getContentBySlug.mockResolvedValue({ content: {}, i18n: { title: 'Home' } });
    const meta = await call();
    expect((meta.openGraph as { type?: string } | undefined)?.type).toBe('website');
  });
});
