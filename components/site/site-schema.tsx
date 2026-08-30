// components/site/site-schema.tsx
import { JsonLd } from './json-ld';
import { organizationJsonLd, webSiteJsonLd } from '@/lib/seo/json-ld';
import { getSettings } from '@/lib/db/queries';
import { locales } from '@/lib/env';
import { SOCIAL_PLATFORMS } from '@/lib/settings-schema';

/**
 * The site's own identity, emitted once on every page from the layout.
 *
 * Rendered from Settings rather than hardcoded, so the fields a client fills in
 * are the fields a language model reads. Nothing here is invented: an empty
 * Settings produces a minimal node with the site name, not a fabricated
 * description.
 */
export async function SiteSchema({ locale }: { locale: 'ar' | 'en' }) {
  const settings = await getSettings();
  const name = settings?.siteName ?? 'CMS';

  // The social profiles, as sameAs. This is what ties a name, a site and a
  // handful of handles together into one entity.
  const links = (settings?.socialLinks ?? {}) as Partial<Record<string, string>>;
  const sameAs = SOCIAL_PLATFORMS.map((p) => links[p])
    .filter((url): url is string => Boolean(url && url.trim()))
    .map((url) => url.trim());

  const organization = organizationJsonLd({
    name,
    // The brand answer is the sentence written to be quoted; the site
    // description is the one written to be truncated by a search engine.
    description: settings?.brandAnswer || settings?.siteDescription,
    logo: settings?.logo,
    sameAs,
    email: settings?.contactEmail,
    phone: settings?.contactPhone,
    country: settings?.countryCode,
  });

  const website = webSiteJsonLd({
    name,
    description: settings?.siteDescription,
    locales,
    searchPath: `/${locale}/search`,
  });

  return (
    <>
      <JsonLd data={organization} />
      <JsonLd data={website} />
    </>
  );
}
