// /app/(site)/[locale]/page.tsx
import { getContentBySlug, getSettings } from '@/lib/db/queries';
import { HeroSection } from '@/components/site/hero-section';
import { ContentRenderer } from '@/components/site/content-renderer';
import { notFound } from 'next/navigation';
import { locales, type Locale } from '@/lib/env';
import { asContentBlocks } from '@/lib/blocks/content-schema';

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;

  // Validate rather than cast. `locale as 'ar' | 'en'` silently passes any
  // segment through to a pgEnum comparison, which Postgres rejects with
  // 22P02 invalid_text_representation — a 500, not a 404.
  if (!locales.includes(locale as Locale)) notFound();
  const typedLocale = locale as Locale;

  const homeContent = await getContentBySlug('home', typedLocale);
  const blocks = asContentBlocks(homeContent?.i18n?.body);

  /**
   * The hero's last resort is the store's OWN name, not this CMS's.
   *
   * The wizard now writes a home page, so this should not be reached on a new
   * install — but a shop can delete or unpublish that page, and when it did,
   * the homepage introduced itself as "New Aeon — Content Management System"
   * to the client's customers. Falling back to the name the operator typed at
   * setup is wrong in a way they can at least see and fix.
   */
  const settings = await getSettings();
  const fallbackTitle = settings?.siteName?.trim() || 'New Aeon';

  /**
   * A slider in the first position IS the hero.
   *
   * Rendering both put a static banner above the thing built to be the banner,
   * so the slider started halfway down the page behind something it was meant
   * to replace. The generic HeroSection stays for a home page that has no
   * slider — otherwise such a site would open abruptly on body text — so this
   * is "the slider takes over", not "the banner is gone".
   */
  const leadsWithSlider = blocks[0]?.type === 'slider';

  return (
    <div>
      {!leadsWithSlider && (
        <HeroSection
          title={homeContent?.i18n?.title || fallbackTitle}
          subtitle={homeContent?.i18n?.excerpt || settings?.siteDescription || undefined}
          backgroundImage={homeContent?.content?.featuredImage ?? undefined}
        />
      )}

      {blocks.length > 0 && (
        // No top padding when the slider leads: a hero has to sit flush under
        // the navbar, and py-16 would leave a band of white above it.
        <section className={leadsWithSlider ? 'pb-16 px-4 max-w-4xl mx-auto' : 'py-16 px-4 max-w-4xl mx-auto'}>
          <ContentRenderer blocks={blocks} locale={typedLocale} />
        </section>
      )}
    </div>
  );
}
