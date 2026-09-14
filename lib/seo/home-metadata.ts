// lib/seo/home-metadata.ts
import 'server-only';
import type { Metadata } from 'next';
import { getContentBySlug, getSettings } from '@/lib/db/queries';
import { getDefaultLocale } from '@/lib/default-locale';
import { buildMetadata } from '@/lib/seo/metadata';
import type { Locale } from '@/lib/env';

/**
 * The head tags for the front page, which had none of its own.
 *
 * Without a generateMetadata the route fell through to the layout's title
 * template default — the bare site name — and to the site description, so the
 * metaTitle and metaDescription an editor sets on the Home page were stored,
 * shown in the admin, and read by nothing: a dead input on the most linked
 * page of the site.
 *
 * It lives here rather than in the route because the route is a .tsx the unit
 * tests cannot import (the repo's tsconfig preserves JSX), and the fallback
 * chain is exactly the part worth pinning.
 */
export async function homeMetadata(locale: Locale): Promise<Metadata> {
  const [home, settings, defaultLocale] = await Promise.all([
    getContentBySlug('home', locale),
    getSettings(),
    getDefaultLocale(),
  ]);

  const siteName = settings?.siteName?.trim() || 'New Aeon';
  const title = home?.i18n?.metaTitle?.trim() || home?.i18n?.title?.trim() || siteName;

  const meta = buildMetadata({
    defaultLocale,
    locale,
    path: '',
    title,
    description: home?.i18n?.metaDescription || home?.i18n?.excerpt || settings?.siteDescription,
    image: home?.i18n?.ogImage ?? settings?.logo,
    // 'website', not 'article': the front page is the site, not a piece of
    // editorial content someone wrote on a date.
    type: 'website',
    noIndex: home?.i18n?.noIndex ?? false,
    siteName,
  });

  // The layout appends " · <site name>" to every title. Without this, a home
  // page with no title of its own renders "al-ai.ai · al-ai.ai".
  if (title === siteName) meta.title = { absolute: siteName };
  return meta;
}
