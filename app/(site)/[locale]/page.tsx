// /app/(site)/[locale]/page.tsx
import { getContentBySlug } from '@/lib/db/queries';
import { HeroSection } from '@/components/site/hero-section';
import { ContentRenderer } from '@/components/site/content-renderer';
import { notFound } from 'next/navigation';
import { locales, type Locale } from '@/lib/env';

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;

  // Validate rather than cast. `locale as 'ar' | 'en'` silently passes any
  // segment through to a pgEnum comparison, which Postgres rejects with
  // 22P02 invalid_text_representation — a 500, not a 404.
  if (!locales.includes(locale as Locale)) notFound();
  const typedLocale = locale as Locale;

  const homeContent = await getContentBySlug('home', typedLocale);

  return (
    <div>
      <HeroSection
        title={homeContent?.i18n?.title || 'New Aeon'}
        subtitle={homeContent?.i18n?.excerpt || 'Content Management System'}
        backgroundImage={homeContent?.content?.featuredImage ?? undefined}
      />

      {homeContent?.i18n?.body && (
        <section className="py-16 px-4 max-w-4xl mx-auto">
          <ContentRenderer blocks={homeContent.i18n.body} locale={typedLocale} />
        </section>
      )}
    </div>
  );
}
