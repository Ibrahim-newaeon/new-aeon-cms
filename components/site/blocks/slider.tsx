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

/**
 * Slide transition, applied as an inline style rather than a `duration-*`
 * class. The wrap-around snap has to happen exactly when the slide finishes
 * moving, so this number is read by both the CSS and the timer — a class would
 * leave two values that must agree and no way to notice when they stop.
 */
const TRANSITION_MS = 500;

/** Two digits, so the counter does not change width between 9 and 10. */
const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Two presentations, chosen by placement.
 *
 * `main` is a SHOWCASE: one slide holds the middle with its neighbours peeking
 * in at both edges, and clicking a neighbour brings it to the centre. Each card
 * is two columns — words on one side, media on the other — stacking on a phone.
 * The track is looped with cloned slides, so there is a neighbour on both sides
 * at every position, including the first and last.
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

  /**
   * Looping needs at least two slides to have anything to clone, and only the
   * showcase shows neighbours at all.
   */
  const looped = showcase && count > 1;

  /**
   * Position in TRACK coordinates.
   *
   * When looped the track is [cloneOfLast, ...slides, cloneOfFirst], so real
   * slide 0 sits at 1 and the real range is 1..count. Outside that range means
   * we are standing on a clone and owe the track a silent snap back.
   */
  const [position, setPosition] = useState(looped ? 1 : 0);
  const [animated, setAnimated] = useState(true);
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

  /** Which real slide is showing, whatever the track is standing on. */
  const index = looped ? (((position - 1) % count) + count) % count : position;

  const step = useCallback(
    (delta: number) =>
      setPosition((p) => (looped ? p + delta : (((p + delta) % count) + count) % count)),
    [looped, count]
  );

  /** Jump to a real slide, by its real index. */
  const go = useCallback((real: number) => setPosition(looped ? real + 1 : real), [looped]);

  const moving = !reducedMotion && animated;
  const rotating = block.autoplay && !paused && !reducedMotion && count > 1;

  useEffect(() => {
    if (!rotating) return;
    const timer = window.setInterval(() => step(1), slideIntervalMs(block.intervalMs));
    return () => window.clearInterval(timer);
  }, [rotating, block.intervalMs, step]);

  /**
   * The seam.
   *
   * Stepping past either end lands on a clone, which looks identical to the
   * slide it copies. Once the movement has finished we swap to the real one
   * with animation off, so the track is back inside its range with nothing
   * visible having happened.
   *
   * A timer rather than `transitionend`: that event does not fire at all when
   * the transition is disabled — which is exactly the reduced-motion case — and
   * fires per property when it does, so it would need filtering anyway.
   */
  useEffect(() => {
    if (!looped) return;
    if (position >= 1 && position <= count) return;

    const settle = () => {
      setAnimated(false);
      setPosition(position === 0 ? count : 1);
    };

    if (!moving) {
      settle();
      return;
    }
    const timer = window.setTimeout(settle, TRANSITION_MS);
    return () => window.clearTimeout(timer);
  }, [looped, position, count, moving]);

  /**
   * Re-arm the transition after a snap.
   *
   * Two frames, not one: a single rAF can still be batched into the same paint
   * as the position change, which puts the transition back before the browser
   * has committed the jump — and the snap animates, which is the whole thing we
   * are hiding.
   */
  useEffect(() => {
    if (animated) return;
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setAnimated(true));
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, [animated]);

  if (count === 0) return null;

  const onKeyDown = (event: React.KeyboardEvent) => {
    // Arrow keys only while the slider has focus, so they do not fight the
    // page's own scrolling.
    if (event.key === 'ArrowRight') step(1);
    else if (event.key === 'ArrowLeft') step(-1);
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
    step(dx < 0 ? 1 : -1);
  };

  return (
    <section
      aria-roledescription="carousel"
      aria-label={copy.region}
      className={cn(
        'relative overflow-hidden',
        showcase
          ? 'bg-site-surface-inverted py-8 sm:py-12'
          : 'bg-site-surface-raised',
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
          position={position}
          index={index}
          looped={looped}
          moving={moving}
          height={block.height}
          locale={locale}
          reducedMotion={reducedMotion}
          onSelect={setPosition}
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
            onClick={() => step(-1)}
            aria-label={copy.previous}
            data-test-id="slider-prev"
            className={cn(
              'rounded-full p-2 text-site-ink-inverted',
              'bg-site-ink-inverted/10 hover:bg-site-ink-inverted/25'
            )}
          >
            <ChevronLeft size={20} aria-hidden="true" className="rtl:rotate-180" />
          </button>

          {showcase && (
            // The counter the showcase layout is built around: where you are
            // and how many there are, rather than dots alone.
            <p
              className="text-sm tabular-nums text-site-ink-inverted/70"
              /*
                Announced only when the slider is NOT rotating on its own.
                A live region that fires every few seconds turns a screen
                reader into a metronome, and the visitor did not ask for any of
                those changes. Once paused, the changes are theirs and worth
                hearing.
              */
              aria-live={rotating ? 'off' : 'polite'}
              data-test-id="slider-counter"
            >
              <span className="text-site-ink-inverted">{pad(index + 1)}</span>
              <span className="mx-1 text-site-ink-inverted/40">/</span>
              {pad(count)}
            </p>
          )}

          <button
            type="button"
            onClick={() => step(1)}
            aria-label={copy.next}
            data-test-id="slider-next"
            className={cn(
              'rounded-full p-2 text-site-ink-inverted',
              'bg-site-ink-inverted/10 hover:bg-site-ink-inverted/25'
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
                  i === index
                    ? 'w-6 bg-site-ink-inverted'
                    : 'w-2 bg-site-ink-inverted/40 hover:bg-site-ink-inverted/70'
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
                'ms-1 rounded-full p-1.5 text-site-ink-inverted',
                'bg-site-ink-inverted/10 hover:bg-site-ink-inverted/25'
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
 * edges, on a looped track.
 *
 * The track carries a clone of the last slide before the first and a clone of
 * the first after the last, so there is always something to peek at on both
 * sides. Clones are `aria-hidden` and inert — visually they are the point, but
 * to a screen reader they are duplicates of slides it has already been told
 * about.
 *
 * Geometry is in `vw`, not measured pixels. The band is full-bleed, so the
 * viewport and the track's container are the same width — which makes "centre
 * card at position p" exactly `50vw - (p + 0.5) * card-width`, with nothing to
 * measure, no resize observer, and no jump on first paint.
 */
function ShowcaseTrack({
  slides,
  position,
  index,
  looped,
  moving,
  height,
  locale,
  reducedMotion,
  onSelect,
  onPointerDown,
  onPointerUp,
}: {
  slides: Slide[];
  position: number;
  index: number;
  looped: boolean;
  moving: boolean;
  height: SliderBlockType['height'];
  locale: 'ar' | 'en';
  reducedMotion: boolean;
  onSelect: (position: number) => void;
  onPointerDown: (event: React.PointerEvent) => void;
  onPointerUp: (event: React.PointerEvent) => void;
}) {
  const copy = COPY[locale];
  const last = slides.length - 1;

  /** Track order, with the wrap-around clones when looping. */
  const cards = looped
    ? [
        { slide: slides[last]!, real: last, clone: true },
        ...slides.map((slide, i) => ({ slide, real: i, clone: false })),
        { slide: slides[0]!, real: 0, clone: true },
      ]
    : slides.map((slide, i) => ({ slide, real: i, clone: false }));

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
        '[--card-w:88vw] sm:[--card-w:72vw]'
      )}
      style={{
        transform: `translateX(calc(50vw - (${position} + 0.5) * var(--card-w)))`,
        // Paired with the snap timer, from one constant.
        transition: moving ? `transform ${TRANSITION_MS}ms ease-out` : 'none',
      }}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
    >
      {cards.map((card, p) => {
        const centred = p === position;
        const slide = card.slide;
        const hasWords = Boolean(slide.eyebrow || slide.title || slide.text);

        return (
          <li
            key={p}
            className="relative w-[var(--card-w)] shrink-0 px-2 sm:px-3"
            // Clones get their own ids so a selector cannot match two cards for
            // the same slide. `data-active` stays on the REAL card for the
            // slide showing, so it is still true during the instant the track
            // is standing on a clone.
            data-test-id={card.clone ? `slider-clone-${card.real}` : `slider-slide-${card.real}`}
            data-active={!card.clone && card.real === index ? 'true' : 'false'}
            aria-hidden={card.clone || undefined}
          >
            <div
              role={card.clone ? undefined : 'group'}
              aria-roledescription={card.clone ? undefined : 'slide'}
              aria-label={
                card.clone
                  ? undefined
                  : copy.slideOf
                      .replace('{n}', String(card.real + 1))
                      .replace('{total}', String(slides.length))
              }
              // Inert unless centred, so links inside a neighbour — or inside a
              // clone, which is never reachable — are not tab stops.
              inert={!centred}
              className={cn(
                // The band behind uses the same slot, so without a hairline the card has
              // no edge. Previously two hardcoded greys did that job; a slot set
              // cannot rely on two shades of the same role being different.
              'grid overflow-hidden rounded-[var(--site-radius)] bg-site-surface-inverted text-site-ink-inverted',
              'ring-1 ring-site-ink-inverted/10',
                HEIGHT[height] ?? HEIGHT.medium,
                hasWords ? 'md:grid-cols-2' : 'grid-cols-1',
                !reducedMotion && 'transition-all duration-500',
                // Dimmed and scaled back rather than hidden: seeing what is on
                // either side is the point of the layout.
                centred ? 'opacity-100 shadow-2xl' : 'scale-[0.94] opacity-50'
              )}
            >
              {hasWords && (
                <div
                  dir={locale === 'ar' ? 'rtl' : 'ltr'}
                  className="flex flex-col justify-center gap-3 p-6 text-start sm:p-10"
                >
                  {slide.eyebrow && (
                    <p className="text-xs uppercase tracking-[0.2em] text-site-ink-inverted/60">
                      {slide.eyebrow}
                    </p>
                  )}
                  {slide.title && (
                    <h2 className="text-2xl font-bold leading-tight sm:text-4xl">{slide.title}</h2>
                  )}
                  {slide.text && (
                    <p className="max-w-prose text-sm text-site-ink-inverted/80 sm:text-base">{slide.text}</p>
                  )}
                  {slide.buttonText && slide.buttonUrl && (
                    <Link
                      href={slide.buttonUrl}
                      className="site-btn-primary mt-2 w-fit"
                    >
                      {slide.buttonText}
                    </Link>
                  )}
                </div>
              )}

              <div className="relative min-h-[160px] md:min-h-0">
                <SlideMedia
                  slide={slide}
                  // Keyed to the real slide, not the track position: the clone
                  // of the last slide is rendered FIRST, and it is the real
                  // first slide that is the LCP element.
                  index={card.real}
                  active={centred}
                  reducedMotion={reducedMotion}
                  sizes="(max-width: 768px) 88vw, 36vw"
                  // A clone must never be the eager one, or the browser is told
                  // to rush a slide that is only ever seen mid-wrap.
                  eager={!card.clone && card.real === 0}
                />
              </div>
            </div>

            {!centred && (
              /*
                A neighbour is selected by clicking it. The card's own content
                is inert, so this transparent overlay takes the click — and
                being a real button, it is what a screen reader announces and a
                keyboard reaches. Selecting by TRACK position, so clicking a
                clone walks the short way round rather than rewinding.
              */
              <button
                type="button"
                onClick={() => onSelect(p)}
                aria-label={copy.goTo.replace('{n}', String(card.real + 1))}
                tabIndex={card.clone ? -1 : undefined}
                aria-hidden={card.clone || undefined}
                /*
                  No id on a clone's overlay. `slider-clone-peek-0` shares a
                  prefix with `slider-clone-0`, so a prefix selector for the
                  cards matched the buttons too and counted four clones where
                  there are two. Clones are decoration; nothing should be
                  selecting them by name.
                */
                data-test-id={card.clone ? undefined : `slider-peek-${card.real}`}
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
              eager={i === 0}
            />

            {(slide.eyebrow || slide.title || slide.text || (slide.buttonText && slide.buttonUrl)) && (
              <div className="absolute inset-0 flex items-center"
                // A scrim, not a colour choice: it exists so the words stay
                // readable over whatever image the shop uploaded. Tied to the
                // inverted-surface slot so a light brand gets a light scrim
                // with dark ink rather than a black band it never asked for.
                style={{
                  backgroundImage:
                    'linear-gradient(to top, color-mix(in srgb, var(--site-surface-inverted) 70%, transparent), color-mix(in srgb, var(--site-surface-inverted) 25%, transparent) 45%, transparent)',
                }}>
                <div className="w-full max-w-3xl p-6 text-site-ink-inverted sm:p-10">
                  {slide.eyebrow && (
                    <p className="mb-2 text-xs uppercase tracking-[0.2em] text-site-ink-inverted/70">
                      {slide.eyebrow}
                    </p>
                  )}
                  {slide.title && <h2 className="text-2xl font-bold sm:text-4xl">{slide.title}</h2>}
                  {slide.text && (
                    <p className="mt-3 max-w-xl text-sm text-site-ink-inverted/90 sm:text-base">{slide.text}</p>
                  )}
                  {slide.buttonText && slide.buttonUrl && (
                    <Link
                      href={slide.buttonUrl}
                      className="site-btn-primary mt-5"
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
  eager,
}: {
  slide: Slide;
  index: number;
  active: boolean;
  reducedMotion: boolean;
  sizes: string;
  eager: boolean;
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
        // Only the centred card gets a src: otherwise every neighbour and every
        // clone loads a player for a slide nobody is watching.
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
        preload={eager ? 'auto' : 'none'}
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
      // The first real slide is the LCP element on a home page; the rest, and
      // every clone, are not.
      priority={eager}
      sizes={sizes}
      className="object-cover"
    />
  );
}
