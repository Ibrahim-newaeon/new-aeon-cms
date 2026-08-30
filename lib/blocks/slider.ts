// lib/blocks/slider.ts
import type { ContentBlock } from './types';

export type SliderBlock = Extract<ContentBlock, { type: 'slider' }>;
export type SliderVariant = SliderBlock['variant'];
export type Slide = SliderBlock['slides'][number];

/**
 * What each placement of the slider is allowed to be.
 *
 * One table, imported by both the editor and the renderer, because the two
 * enforce the same rules for different reasons: the editor to stop an author
 * building something unsupported, the renderer because stored JSON can carry
 * anything a previous deploy, a hand edit or a restored dump left behind. A
 * limit written twice is a limit that will disagree with itself.
 *
 * - `main` is the home-page hero: image or video, up to five slides.
 * - `inner` is for ordinary pages: images only, at most two. A page slider is
 *   a supporting element, and an autoplaying video partway down an article is
 *   a distraction rather than a feature.
 */
export const SLIDER_LIMITS = {
  main: { maxSlides: 5, allowVideo: true },
  inner: { maxSlides: 2, allowVideo: false },
} as const satisfies Record<SliderVariant, { maxSlides: number; allowVideo: boolean }>;

export function sliderLimits(variant: SliderVariant) {
  return SLIDER_LIMITS[variant] ?? SLIDER_LIMITS.main;
}

/**
 * The slides that should actually render.
 *
 * Drops entries with no source, forces video back to image where the variant
 * does not allow it, and applies the count cap. Called by the renderer so a
 * body that predates a limit — or was written by hand — degrades to something
 * valid instead of rendering an empty frame or an eleventh slide.
 */
export function usableSlides(block: SliderBlock): Slide[] {
  const limits = sliderLimits(block.variant);
  return block.slides
    .filter((slide) => slide.src.trim().length > 0)
    .flatMap<Slide>((slide) => {
      if (slide.kind === 'image' || limits.allowVideo) return [slide];
      // The placement forbids moving media. Fall back to the poster if the
      // author set one — an earlier version relabelled the slide as an image
      // and kept `src`, which pointed an <img> at an .mp4 or a YouTube page.
      return slide.poster ? [{ ...slide, kind: 'image', src: slide.poster }] : [];
    })
    .slice(0, limits.maxSlides);
}

/**
 * Seconds between slides, clamped.
 *
 * Zero would repaint as fast as the browser allows, and the value comes from
 * stored JSON rather than from a control that can be trusted.
 */
export function slideIntervalMs(intervalMs: number): number {
  return Math.min(30_000, Math.max(2_000, intervalMs || 6_000));
}
