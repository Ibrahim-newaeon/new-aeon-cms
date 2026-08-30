// tests/slider.test.ts
import { describe, it, expect } from 'vitest';
import { SLIDER_LIMITS, sliderLimits, usableSlides, slideIntervalMs } from '@/lib/blocks/slider';
import type { SliderBlock } from '@/lib/blocks/slider';

const build = (over: Partial<SliderBlock> = {}): SliderBlock => ({
  type: 'slider',
  variant: 'main',
  slides: [],
  autoplay: true,
  intervalMs: 6000,
  height: 'medium',
  ...over,
});

const image = (src: string) => ({ kind: 'image' as const, src });
const video = (src: string) => ({ kind: 'video' as const, src });

describe('slider limits', () => {
  it('gives the home hero five slides and video, and inner pages two images', () => {
    expect(SLIDER_LIMITS.main).toEqual({ maxSlides: 5, allowVideo: true });
    expect(SLIDER_LIMITS.inner).toEqual({ maxSlides: 2, allowVideo: false });
  });

  it('falls back to the main rules for a variant it does not recognise', () => {
    // Stored JSON, not a typed value: a body written by a newer deploy can name
    // a placement this build has never heard of, and the renderer still has to
    // put something on the page.
    expect(sliderLimits('nonsense' as SliderBlock['variant'])).toBe(SLIDER_LIMITS.main);
  });
});

describe('usableSlides', () => {
  it('drops slides with no source', () => {
    // Adding a slide creates it empty, so a half-finished one reaching the page
    // is ordinary, not exotic. An empty frame in a rotation looks broken.
    const block = build({ slides: [image('/a.png'), image('  '), image('/b.png')] });
    expect(usableSlides(block).map((s) => s.src)).toEqual(['/a.png', '/b.png']);
  });

  it('caps the home hero at five', () => {
    const block = build({ slides: Array.from({ length: 8 }, (_, i) => image(`/s${i}.png`)) });
    expect(usableSlides(block)).toHaveLength(5);
  });

  it('caps an inner-page slider at two', () => {
    const block = build({
      variant: 'inner',
      slides: Array.from({ length: 5 }, (_, i) => image(`/s${i}.png`)),
    });
    expect(usableSlides(block)).toHaveLength(2);
  });

  it('demotes video to image on an inner page rather than dropping the slide', () => {
    // The author still chose that media. Dropping it would silently lose a
    // slide; rendering the file as an image at least shows the poster path and
    // makes the mistake visible.
    const block = build({ variant: 'inner', slides: [video('/clip.mp4')] });
    expect(usableSlides(block)).toEqual([{ kind: 'image', src: '/clip.mp4' }]);
  });

  it('keeps video on the home hero', () => {
    const block = build({ slides: [video('/clip.mp4')] });
    expect(usableSlides(block)[0]?.kind).toBe('video');
  });
});

describe('slideIntervalMs', () => {
  it('clamps a zero or missing interval to something watchable', () => {
    // 0 would advance on every repaint.
    expect(slideIntervalMs(0)).toBe(6000);
    expect(slideIntervalMs(500)).toBe(2000);
  });

  it('caps a very long interval', () => {
    expect(slideIntervalMs(999_999)).toBe(30_000);
  });

  it('passes a sensible value through untouched', () => {
    expect(slideIntervalMs(8000)).toBe(8000);
  });
});
