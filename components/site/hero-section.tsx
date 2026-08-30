import Image from 'next/image';
import Link from 'next/link';

interface HeroSectionProps {
  title: string;
  subtitle?: string;
  cta?: { text: string; url: string };
  backgroundImage?: string;
  overlay?: boolean;
}

export function HeroSection({ title, subtitle, cta, backgroundImage, overlay = true }: HeroSectionProps) {
  return (
    <section
      className="relative min-h-[60vh] flex items-center justify-center overflow-hidden"
      // So a spec can assert this is ABSENT when a slider leads the page.
      // Without an id, "the banner did not render" is unfalsifiable.
      data-test-id="hero-section"
    >
      {backgroundImage ? (
        <>
          {/* priority: this is the LCP element on almost every page it appears
              on, so it must not be lazy-loaded. fill + sizes lets Next serve a
              viewport-appropriate width instead of the full-size original. */}
          <Image
            src={backgroundImage}
            alt=""
            fill
            priority
            sizes="100vw"
            className="absolute inset-0 w-full h-full object-cover"
          />
          {overlay && <div className="absolute inset-0 bg-site-surface-inverted/45" />}
        </>
      ) : (
        // The fallback when no background image is set: the brand colour over
        // the inverted surface, rather than a fixed indigo/purple nobody chose.
        <>
          <div className="absolute inset-0 bg-site-surface-inverted" />
          <div className="absolute inset-0 bg-gradient-to-br from-site-accent/30 to-transparent" />
        </>
      )}

      <div className="relative z-10 text-center px-4 max-w-3xl mx-auto">
        <h1 className="text-4xl md:text-6xl font-bold text-site-ink-inverted mb-4">{title}</h1>
        {subtitle && <p className="text-lg md:text-xl text-site-ink-inverted/90 mb-8">{subtitle}</p>}
        {cta && (
          <Link href={cta.url} className="inline-flex items-center px-8 py-3 bg-site-surface text-site-ink rounded-full font-medium hover:bg-site-surface-raised transition-colors">
            {cta.text}
          </Link>
        )}
      </div>
    </section>
  );
}
