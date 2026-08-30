'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';
import {
  slideIntervalMs,
  usableSlides,
  type SliderBlock as SliderBlockType,
} from '@/lib/blocks/slider';
import { youTubeEmbedUrl, youTubeId, youTubeThumbnail } from '@/lib/blocks/youtube';

const COPY = {
  ar: {
    region: 'شرائح متحركة',
    previous: 'الشريحة السابقة',
    next: 'الشريحة التالية',
    goTo: 'الانتقال إلى الشريحة {n}',
    pause: 'إيقاف التدوير',
    play: 'تشغيل التدوير',
    slideOf: 'الشريحة {n} من {total}',
  },
  en: {
    region: 'Rotating slides',
    previous: 'Previous slide',
    next: 'Next slide',
    goTo: 'Go to slide {n}',
    pause: 'Pause rotation',
    play: 'Resume rotation',
    slideOf: 'Slide {n} of {total}',
  },
} as const;

const HEIGHT: Record<SliderBlockType['height'], string> = {
  short: 'h-[240px] sm:h-[320px]',
  medium: 'h-[340px] sm:h-[460px]',
  tall: 'h-[440px] sm:h-[600px]',
};

/**
 * Home-page hero slider. Nothing here knows about commerce — a slide is an
 * image, some optional words and one link — so the same block serves a content
 * site and a shop, and a slide can point at a product URL without this
 * component depending on the catalogue.
 */
export function SliderBlock({
  block,
  locale,
}: {
  block: SliderBlockType;
  locale: 'ar' | 'en';
}) {
  const copy = COPY[locale];
  // Shared with the editor: drops empty slides, demotes video where the
  // placement forbids it, and applies the per-variant count cap. Stored JSON
  // is not a trusted input.
  const slides = usableSlides(block);
  const count = slides.length;

  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const regionRef = useRef<HTMLDivElement>(null);

  // A visitor who asked their OS for less motion should not be handed a
  // carousel that moves on its own. Read live rather than once, so toggling the
  // preference takes effect without a reload.
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => setReducedMotion(query.matches);
    apply();
    query.addEventListener('change', apply);
    return () => query.removeEventListener('change', apply);
  }, []);

  const go = useCallback(
    (next: number) => setIndex(((next % count) + count) % count),
    [count]
  );

  const rotating = block.autoplay && !paused && !reducedMotion && count > 1;

  useEffect(() => {
    if (!rotating) return;
    const timer = window.setInterval(
      () => setIndex((i) => (i + 1) % count),
      slideIntervalMs(block.intervalMs)
    );
    return () => window.clearInterval(timer);
  }, [rotating, block.intervalMs, count]);

  if (count === 0) return null;

  const onKeyDown = (event: React.KeyboardEvent) => {
    // Arrow keys only while the slider itself has focus, so they do not fight
    // the page's own scrolling.
    if (event.key === 'ArrowRight') go(index + (locale === 'ar' ? -1 : 1));
    else if (event.key === 'ArrowLeft') go(index + (locale === 'ar' ? 1 : -1));
    else return;
    event.preventDefault();
  };

  return (
    <section
      ref={regionRef}
      aria-roledescription="carousel"
      aria-label={copy.region}
      className="relative overflow-hidden rounded-xl bg-gray-100"
      data-test-id="slider"
      // Hover and focus pause it: text that slides away mid-sentence is the
      // single most common complaint about carousels.
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      onKeyDown={onKeyDown}
      tabIndex={-1}
    >
      <div className={`relative w-full ${HEIGHT[block.height] ?? HEIGHT.medium}`}>
        {slides.map((slide, i) => {
          const active = i === index;
          return (
            <div
              key={i}
              role="group"
              aria-roledescription="slide"
              aria-label={copy.slideOf
                .replace('{n}', String(i + 1))
                .replace('{total}', String(count))}
              aria-hidden={!active}
              // Inert rather than unmounted: a link inside a hidden slide must
              // not be tabbable, and unmounting would restart the image fetch
              // every rotation.
              inert={!active}
              className={`absolute inset-0 transition-opacity duration-700 ${
                active ? 'opacity-100' : 'opacity-0'
              }`}
              data-test-id={`slider-slide-${i}`}
              data-active={active ? 'true' : 'false'}
            >
              {slide.kind === 'youtube' ? (
                (() => {
                  const id = youTubeId(slide.src);
                  // An unusable link renders the poster, or nothing — never an
                  // iframe pointed at a guess.
                  if (!id) {
                    return slide.poster ? (
                      <Image
                        src={slide.poster}
                        alt={slide.alt ?? ''}
                        fill
                        sizes="100vw"
                        className="object-cover"
                      />
                    ) : null;
                  }
                  if (reducedMotion) {
                    return (
                      <Image
                        // The poster if the author set one, otherwise YouTube's
                        // own still — so a reduced-motion visitor still sees the
                        // slide rather than an empty frame.
                        src={slide.poster ?? youTubeThumbnail(id)}
                        alt={slide.alt ?? ''}
                        fill
                        sizes="100vw"
                        className="object-cover"
                        unoptimized={!slide.poster}
                      />
                    );
                  }
                  return (
                    <iframe
                      // Only the visible slide gets a src. Four hidden iframes
                      // would each load a player and its network traffic for a
                      // slide nobody is looking at.
                      src={active ? youTubeEmbedUrl(id, { autoplay: true, muted: true, controls: false }) : undefined}
                      title={slide.alt ?? slide.title ?? 'YouTube'}
                      allow="autoplay; encrypted-media; picture-in-picture"
                      referrerPolicy="strict-origin-when-cross-origin"
                      // A background video must not be a tab stop: it carries
                      // no controls, so focusing it would strand a keyboard
                      // user on nothing.
                      tabIndex={-1}
                      className="pointer-events-none absolute inset-0 h-full w-full border-0"
                      data-test-id={`slider-youtube-${i}`}
                    />
                  );
                })()
              ) : slide.kind === 'video' && !reducedMotion ? (
                <video
                  // Muted + playsInline is what makes autoplay legal on iOS and
                  // Android; without playsInline Safari takes the video
                  // fullscreen on play, which would hijack the page.
                  src={slide.src}
                  poster={slide.poster}
                  muted
                  loop
                  playsInline
                  autoPlay={active}
                  preload={i === 0 ? 'auto' : 'none'}
                  aria-label={slide.alt || undefined}
                  className="absolute inset-0 h-full w-full object-cover"
                  data-test-id={`slider-video-${i}`}
                />
              ) : (
                <Image
                  // A reduced-motion visitor gets the poster as a still, which
                  // is why a video slide is worth a poster even when it plays.
                  src={slide.kind === 'video' ? (slide.poster ?? slide.src) : slide.src}
                  alt={slide.alt ?? ''}
                  fill
                  // The hero is the LCP element on a home page, so the first
                  // slide is eager and the rest are not.
                  priority={i === 0}
                  sizes="100vw"
                  className="object-cover"
                />
              )}

              {(slide.title || slide.text || (slide.buttonText && slide.buttonUrl)) && (
                <div className="absolute inset-0 flex items-center bg-gradient-to-t from-black/65 via-black/25 to-transparent">
                  <div className="w-full max-w-3xl p-6 sm:p-10 text-white">
                    {slide.title && (
                      <h2 className="text-2xl font-bold sm:text-4xl">{slide.title}</h2>
                    )}
                    {slide.text && (
                      <p className="mt-3 max-w-xl text-sm sm:text-base text-white/90">
                        {slide.text}
                      </p>
                    )}
                    {slide.buttonText && slide.buttonUrl && (
                      <Link
                        href={slide.buttonUrl}
                        className="mt-5 inline-flex rounded-lg bg-[var(--site-accent)] px-6 py-3 text-sm font-medium text-[var(--site-accent-ink)] hover:opacity-90"
                      >
                        {slide.buttonText}
                      </Link>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {count > 1 && (
        <>
          {/* start/end rather than left/right: the arrows must not swap sides
              between the Arabic and English trees. */}
          <button
            type="button"
            onClick={() => go(index - 1)}
            aria-label={copy.previous}
            data-test-id="slider-prev"
            className="absolute start-3 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-2 text-white hover:bg-black/60"
          >
            <ChevronLeft size={20} aria-hidden="true" className="rtl:rotate-180" />
          </button>

          <button
            type="button"
            onClick={() => go(index + 1)}
            aria-label={copy.next}
            data-test-id="slider-next"
            className="absolute end-3 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-2 text-white hover:bg-black/60"
          >
            <ChevronRight size={20} aria-hidden="true" className="rtl:rotate-180" />
          </button>

          <div className="absolute bottom-3 start-0 end-0 flex items-center justify-center gap-2">
            {slides.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => go(i)}
                aria-label={copy.goTo.replace('{n}', String(i + 1))}
                aria-current={i === index}
                data-test-id={`slider-dot-${i}`}
                className={`h-2 rounded-full transition-all ${
                  i === index ? 'w-6 bg-white' : 'w-2 bg-white/50 hover:bg-white/80'
                }`}
              />
            ))}

            {block.autoplay && !reducedMotion && (
              // WCAG 2.2.2: anything that moves for more than five seconds
              // needs a way to stop it that does not depend on hovering.
              <button
                type="button"
                onClick={() => setPaused((p) => !p)}
                aria-label={paused ? copy.play : copy.pause}
                data-test-id="slider-toggle"
                className="ms-2 rounded-full bg-black/40 p-1.5 text-white hover:bg-black/60"
              >
                {paused ? (
                  <Play size={14} aria-hidden="true" />
                ) : (
                  <Pause size={14} aria-hidden="true" />
                )}
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}
