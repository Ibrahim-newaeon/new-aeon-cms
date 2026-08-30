'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  slideIntervalMs,
  usableSlides,
  type Slide,
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

/** Two digits, so the counter does not change width between 9 and 10. */
const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Two presentations, chosen by placement.
 *
 * `main` is a SHOWCASE: one slide holds the middle with its neighbours peeking
 * in at both edges, and clicking a neighbour brings it to the centre. Each card
 * is two columns — words on one side, media on the other — stacking on a phone.
 *
 * `inner` keeps the plainer full-bleed crossfade: one slide at a time, media
 * filling the frame with the words over it. A showcase partway down an article
 * competes with the article; a home hero is the page.
 *
 * Everything else is shared: autoplay with a pause control, hover and focus
 * pausing, reduced-motion handling, swipe, keyboard, and the same limits.
 * Nothing here knows about commerce — a slide is media, words and one link.
 */
export function SliderBlock({
  block,
  locale,
}: {
  block: SliderBlockType;
  locale: 'ar' | 'en';
}) {
  const copy = COPY[locale];
  const slides = usableSlides(block);
  const count = slides.length;
  const showcase = block.variant === 'main';

  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const dragStart = useRef<number | null>(null);

  // Read live rather than once, so toggling the OS preference takes effect
  // without a reload.
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
    // Arrow keys only while the slider has focus, so they do not fight the
    // page's own scrolling.
    if (event.key === 'ArrowRight') go(index + 1);
    else if (event.key === 'ArrowLeft') go(index - 1);
    else return;
    event.preventDefault();
  };

  /**
   * Horizontal drag, which is how a carousel is used on a phone. Pointer
   * events rather than touch events so a mouse drag works too; the threshold
   * keeps a sloppy tap from counting as a swipe.
   */
  const onPointerDown = (event: React.PointerEvent) => {
    dragStart.current = event.clientX;
  };
  const onPointerUp = (event: React.PointerEvent) => {
    const start = dragStart.current;
    dragStart.current = null;
    if (start === null) return;
    const dx = event.clientX - start;
    if (Math.abs(dx) < 40) return;
    go(index + (dx < 0 ? 1 : -1));
  };

  return (
    <section
      aria-roledescription="carousel"
      aria-label={copy.region}
      className={cn(
        'relative overflow-hidden',
        showcase ? 'bg-gray-950 py-8 sm:py-12' : 'bg-gray-100',
        // Full bleed. Every page wraps its blocks in `max-w-4xl mx-auto`, so
        // the band has to break out to reach the edges. `overflow-x: clip` on
        // <main> absorbs the scrollbar width that 100vw counts and the visible
        // area does not.
        'mx-[calc(50%-50vw)] w-screen max-w-[100vw]'
      )}
      data-test-id="slider"
      data-variant={block.variant}
      data-layout={showcase ? 'showcase' : 'crossfade'}
      // Hover and focus pause it: text that slides away mid-sentence is the
      // most common complaint about carousels.
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      onKeyDown={onKeyDown}
      tabIndex={-1}
    >
      {showcase ? (
        <ShowcaseTrack
          slides={slides}
          index={index}
          height={block.height}
          locale={locale}
          reducedMotion={reducedMotion}
          onSelect={go}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
        />
      ) : (
        <CrossfadeStack
          slides={slides}
          index={index}
          height={block.height}
          reducedMotion={reducedMotion}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
        />
      )}

      {count > 1 && (
        <div
          className={cn(
            'flex items-center justify-center gap-3',
            showcase ? 'mt-6' : 'absolute bottom-3 start-0 end-0'
          )}
        >
          {/* start/end rather than left/right: the controls must not swap
              sides between the Arabic and English trees. */}
          <button
            type="button"
            onClick={() => go(index - 1)}
            aria-label={copy.previous}
            data-test-id="slider-prev"
            className={cn(
              'rounded-full p-2 text-white',
              showcase ? 'bg-white/10 hover:bg-white/20' : 'bg-black/40 hover:bg-black/60'
            )}
          >
            <ChevronLeft size={20} aria-hidden="true" className="rtl:rotate-180" />
          </button>

          {showcase && (
            // The counter the showcase layout is built around: where you are
            // and how many there are, rather than dots alone.
            <p
              className="text-sm tabular-nums text-white/70"
              aria-live="polite"
              data-test-id="slider-counter"
            >
              <span className="text-white">{pad(index + 1)}</span>
              <span className="mx-1 text-white/40">/</span>
              {pad(count)}
            </p>
          )}

          <button
            type="button"
            onClick={() => go(index + 1)}
            aria-label={copy.next}
            data-test-id="slider-next"
            className={cn(
              'rounded-full p-2 text-white',
              showcase ? 'bg-white/10 hover:bg-white/20' : 'bg-black/40 hover:bg-black/60'
            )}
          >
            <ChevronRight size={20} aria-hidden="true" className="rtl:rotate-180" />
          </button>

          <div className="ms-1 flex items-center gap-2">
            {slides.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => go(i)}
                aria-label={copy.goTo.replace('{n}', String(i + 1))}
                aria-current={i === index}
                data-test-id={`slider-dot-${i}`}
                className={cn(
                  'h-2 rounded-full transition-all',
                  i === index ? 'w-6 bg-white' : 'w-2 bg-white/40 hover:bg-white/70'
                )}
              />
            ))}
          </div>

          {block.autoplay && !reducedMotion && (
            // WCAG 2.2.2: anything moving for more than five seconds needs a
            // way to stop it that does not depend on hovering.
            <button
              type="button"
              onClick={() => setPaused((p) => !p)}
              aria-label={paused ? copy.play : copy.pause}
              data-test-id="slider-toggle"
              className={cn(
                'ms-1 rounded-full p-1.5 text-white',
                showcase ? 'bg-white/10 hover:bg-white/20' : 'bg-black/40 hover:bg-black/60'
              )}
            >
              {paused ? <Play size={14} aria-hidden="true" /> : <Pause size={14} aria-hidden="true" />}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

/**
 * The home-page layout: a centred card with its neighbours showing at the
 * edges.
 *
 * Geometry is in `vw`, not measured pixels. The band is full-bleed, so the
 * viewport and the track's container are the same width — which makes "centre
 * card i" exactly `50vw - (i + 0.5) * card-width`, with nothing to measure, no
 * resize observer, and no jump on first paint.
 */
function ShowcaseTrack({
  slides,
  index,
  height,
  locale,
  reducedMotion,
  onSelect,
  onPointerDown,
  onPointerUp,
}: {
  slides: Slide[];
  index: number;
  height: SliderBlockType['height'];
  locale: 'ar' | 'en';
  reducedMotion: boolean;
  onSelect: (index: number) => void;
  onPointerDown: (event: React.PointerEvent) => void;
  onPointerUp: (event: React.PointerEvent) => void;
}) {
  const copy = COPY[locale];

  return (
    <ul
      /*
        Pinned to LTR on purpose. `dir="rtl"` reverses flex order, which would
        silently invert the translate maths on the Arabic tree. The words inside
        each card get the real direction back.
      */
      dir="ltr"
      className={cn(
        'flex items-stretch',
        // The card is a share of the viewport; the remainder is what the
        // neighbours show through. Wider on a phone, so the peek does not eat
        // the content.
        '[--card-w:88vw] sm:[--card-w:72vw]',
        !reducedMotion && 'transition-transform duration-500 ease-out'
      )}
      style={{ transform: `translateX(calc(50vw - (${index} + 0.5) * var(--card-w)))` }}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
    >
      {slides.map((slide, i) => {
        const active = i === index;
        const hasWords = Boolean(slide.eyebrow || slide.title || slide.text);

        return (
          <li
            key={i}
            className="relative w-[var(--card-w)] shrink-0 px-2 sm:px-3"
            data-test-id={`slider-slide-${i}`}
            data-active={active ? 'true' : 'false'}
          >
            <div
              role="group"
              aria-roledescription="slide"
              aria-label={copy.slideOf
                .replace('{n}', String(i + 1))
                .replace('{total}', String(slides.length))}
              // Inert while it is not the centre card, so links inside a
              // neighbour are not tab stops.
              inert={!active}
              className={cn(
                'grid overflow-hidden rounded-2xl bg-gray-900 text-white',
                HEIGHT[height] ?? HEIGHT.medium,
                hasWords ? 'md:grid-cols-2' : 'grid-cols-1',
                !reducedMotion && 'transition-all duration-500',
                // Dimmed and scaled back rather than hidden: seeing what is on
                // either side is the point of the layout.
                active ? 'opacity-100 shadow-2xl' : 'scale-[0.94] opacity-50'
              )}
            >
              {hasWords && (
                <div
                  dir={locale === 'ar' ? 'rtl' : 'ltr'}
                  className="flex flex-col justify-center gap-3 p-6 text-start sm:p-10"
                >
                  {slide.eyebrow && (
                    <p className="text-xs uppercase tracking-[0.2em] text-white/60">
                      {slide.eyebrow}
                    </p>
                  )}
                  {slide.title && (
                    <h2 className="text-2xl font-bold leading-tight sm:text-4xl">{slide.title}</h2>
                  )}
                  {slide.text && (
                    <p className="max-w-prose text-sm text-white/80 sm:text-base">{slide.text}</p>
                  )}
                  {slide.buttonText && slide.buttonUrl && (
                    <Link
                      href={slide.buttonUrl}
                      className="mt-2 inline-flex w-fit rounded-lg bg-[var(--site-accent)] px-6 py-3 text-sm font-medium text-[var(--site-accent-ink)] hover:opacity-90"
                    >
                      {slide.buttonText}
                    </Link>
                  )}
                </div>
              )}

              <div className="relative min-h-[160px] md:min-h-0">
                <SlideMedia
                  slide={slide}
                  index={i}
                  active={active}
                  reducedMotion={reducedMotion}
                  sizes="(max-width: 768px) 88vw, 36vw"
                />
              </div>
            </div>

            {!active && (
              /*
                A neighbour is selected by clicking it. The card's own content
                is inert, so this transparent overlay takes the click — and
                being a real button, it is what a screen reader announces and a
                keyboard can reach.
              */
              <button
                type="button"
                onClick={() => onSelect(i)}
                aria-label={copy.goTo.replace('{n}', String(i + 1))}
                data-test-id={`slider-peek-${i}`}
                className="absolute inset-0 z-10 cursor-pointer"
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** The inner-page layout: one slide at a time, media filling the frame. */
function CrossfadeStack({
  slides,
  index,
  height,
  reducedMotion,
  onPointerDown,
  onPointerUp,
}: {
  slides: Slide[];
  index: number;
  height: SliderBlockType['height'];
  reducedMotion: boolean;
  onPointerDown: (event: React.PointerEvent) => void;
  onPointerUp: (event: React.PointerEvent) => void;
}) {
  return (
    <div
      className={cn('relative w-full', HEIGHT[height] ?? HEIGHT.medium)}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
    >
      {slides.map((slide, i) => {
        const active = i === index;
        return (
          <div
            key={i}
            role="group"
            aria-roledescription="slide"
            aria-label={`${i + 1} / ${slides.length}`}
            aria-hidden={!active}
            // Inert rather than unmounted: a link inside a hidden slide must
            // not be tabbable, and unmounting would refetch the image on every
            // rotation.
            inert={!active}
            className={cn(
              'absolute inset-0',
              !reducedMotion && 'transition-opacity duration-700',
              active ? 'opacity-100' : 'opacity-0'
            )}
            data-test-id={`slider-slide-${i}`}
            data-active={active ? 'true' : 'false'}
          >
            <SlideMedia
              slide={slide}
              index={i}
              active={active}
              reducedMotion={reducedMotion}
              sizes="100vw"
            />

            {(slide.eyebrow || slide.title || slide.text || (slide.buttonText && slide.buttonUrl)) && (
              <div className="absolute inset-0 flex items-center bg-gradient-to-t from-black/65 via-black/25 to-transparent">
                <div className="w-full max-w-3xl p-6 sm:p-10 text-white">
                  {slide.eyebrow && (
                    <p className="mb-2 text-xs uppercase tracking-[0.2em] text-white/70">
                      {slide.eyebrow}
                    </p>
                  )}
                  {slide.title && <h2 className="text-2xl font-bold sm:text-4xl">{slide.title}</h2>}
                  {slide.text && (
                    <p className="mt-3 max-w-xl text-sm text-white/90 sm:text-base">{slide.text}</p>
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
  );
}

function SlideMedia({
  slide,
  index,
  active,
  reducedMotion,
  sizes,
}: {
  slide: Slide;
  index: number;
  active: boolean;
  reducedMotion: boolean;
  sizes: string;
}) {
  if (slide.kind === 'youtube') {
    const id = youTubeId(slide.src);
    // An unusable link renders the poster, or nothing — never an iframe
    // pointed at a guess.
    if (!id) {
      return slide.poster ? (
        <Image src={slide.poster} alt={slide.alt ?? ''} fill sizes={sizes} className="object-cover" />
      ) : null;
    }
    if (reducedMotion) {
      return (
        <Image
          // The poster if the author set one, otherwise YouTube's own still —
          // so a reduced-motion visitor still sees the slide.
          src={slide.poster ?? youTubeThumbnail(id)}
          alt={slide.alt ?? ''}
          fill
          sizes={sizes}
          className="object-cover"
          unoptimized={!slide.poster}
        />
      );
    }
    return (
      <iframe
        // Only the visible card gets a src: otherwise every neighbour loads a
        // player for a slide nobody is watching.
        src={active ? youTubeEmbedUrl(id, { autoplay: true, muted: true, controls: false }) : undefined}
        title={slide.alt ?? slide.title ?? 'YouTube'}
        allow="autoplay; encrypted-media; picture-in-picture"
        referrerPolicy="strict-origin-when-cross-origin"
        // A controlless background video must not be a tab stop.
        tabIndex={-1}
        className="pointer-events-none absolute inset-0 h-full w-full border-0"
        data-test-id={`slider-youtube-${index}`}
      />
    );
  }

  if (slide.kind === 'video' && !reducedMotion) {
    return (
      <video
        // muted + playsInline is what makes autoplay legal on iOS and Android;
        // without playsInline Safari takes the video fullscreen on play.
        src={slide.src}
        poster={slide.poster}
        muted
        loop
        playsInline
        autoPlay={active}
        preload={index === 0 ? 'auto' : 'none'}
        aria-label={slide.alt || undefined}
        className="absolute inset-0 h-full w-full object-cover"
        data-test-id={`slider-video-${index}`}
      />
    );
  }

  return (
    <Image
      src={slide.kind === 'video' ? (slide.poster ?? slide.src) : slide.src}
      alt={slide.alt ?? ''}
      fill
      // The first slide is the LCP element on a home page; the rest are not.
      priority={index === 0}
      sizes={sizes}
      className="object-cover"
    />
  );
}
