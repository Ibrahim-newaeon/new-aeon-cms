// tests/slider.test.ts
import { describe, it, expect } from 'vitest';
import { SLIDER_LIMITS, sliderLimits, usableSlides, slideIntervalMs } from '@/lib/blocks/slider';
import type { SliderBlock } from '@/lib/blocks/slider';
import { youTubeEmbedUrl, youTubeId } from '@/lib/blocks/youtube';

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

  it('falls back to the poster when an inner page carries a video slide', () => {
    // Relabelling it as an image and keeping src pointed an <img> at an .mp4.
    // The poster is the still the author already provided for exactly this.
    const block = build({
      variant: 'inner',
      slides: [{ kind: 'video', src: '/clip.mp4', poster: '/still.png' }],
    });
    expect(usableSlides(block)).toEqual([
      { kind: 'image', src: '/still.png', poster: '/still.png' },
    ]);
  });

  it('drops a video slide on an inner page when there is no poster', () => {
    // Nothing showable: an empty frame in the rotation is worse than one fewer
    // slide.
    const block = build({ variant: 'inner', slides: [video('/clip.mp4'), image('/a.png')] });
    expect(usableSlides(block).map((s) => s.src)).toEqual(['/a.png']);
  });

  it('treats a YouTube slide the same way on an inner page', () => {
    const block = build({
      variant: 'inner',
      slides: [{ kind: 'youtube', src: 'https://youtu.be/dQw4w9WgXcQ' }],
    });
    expect(usableSlides(block)).toEqual([]);
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


describe('youTubeId', () => {
  it('reads the id from the shapes people actually paste', () => {
    for (const url of [
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://youtu.be/dQw4w9WgXcQ',
      'https://www.youtube.com/embed/dQw4w9WgXcQ',
      'https://www.youtube.com/shorts/dQw4w9WgXcQ',
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
      'https://youtube.com/watch?v=dQw4w9WgXcQ&t=42s',
      'dQw4w9WgXcQ',
    ]) {
      expect(youTubeId(url), url).toBe('dQw4w9WgXcQ');
    }
  });

  it('returns null rather than guessing at a non-video URL', () => {
    // The previous inline parser took the last path segment, so a channel URL
    // produced an embed of the channel name.
    for (const url of [
      'https://www.youtube.com/@somechannel',
      'https://example.com/watch?v=dQw4w9WgXcQ',
      'not a url',
      '',
      '   ',
    ]) {
      expect(youTubeId(url), url).toBeNull();
    }
  });
});

describe('youTubeEmbedUrl', () => {
  it('uses the no-cookie host and sets playlist so loop actually loops', () => {
    const url = youTubeEmbedUrl('dQw4w9WgXcQ', { autoplay: true, muted: true, controls: false });
    expect(url.startsWith('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?')).toBe(true);
    const params = new URLSearchParams(url.split('?')[1]);
    // loop=1 alone is ignored by YouTube for a single video.
    expect(params.get('playlist')).toBe('dQw4w9WgXcQ');
    expect(params.get('loop')).toBe('1');
    expect(params.get('autoplay')).toBe('1');
    expect(params.get('mute')).toBe('1');
    expect(params.get('controls')).toBe('0');
  });
});
