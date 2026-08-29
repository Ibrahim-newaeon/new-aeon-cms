import { describe, it, expect } from 'vitest';
import { trendOf, trendWindows, TREND_WINDOW_DAYS } from '@/lib/admin/trend';

/**
 * The dashboard previously showed no trends at all, because the ones that
 * existed were invented numbers. The point of this module is that "we cannot
 * say" is a real answer rather than something dressed up as a percentage.
 */
describe('trendOf', () => {
  it('reports nothing at all when both windows are empty', () => {
    // An empty row beats a confident zero.
    expect(trendOf(0, 0)).toEqual({ kind: 'none' });
  });

  it('does NOT turn a zero baseline into +100%', () => {
    // Going from 0 to 3 is not a 100% increase, it is the first three. A
    // percentage here is noise dressed as signal.
    const trend = trendOf(3, 0);
    expect(trend.kind).toBe('new');
    expect(trend).toEqual({ kind: 'new', current: 3 });
  });

  it('computes a rise', () => {
    expect(trendOf(150, 100)).toEqual({
      kind: 'change',
      percent: 50,
      direction: 'up',
      current: 150,
      previous: 100,
    });
  });

  it('computes a fall, reporting the magnitude unsigned', () => {
    const trend = trendOf(50, 100);
    expect(trend).toMatchObject({ kind: 'change', percent: 50, direction: 'down' });
  });

  it('reports no movement as flat, not as a rise', () => {
    // Colouring "no change" as positive is the small dishonesty that makes a
    // dashboard stop being read.
    expect(trendOf(100, 100)).toMatchObject({ percent: 0, direction: 'flat' });
  });

  it('never labels a change that displays as 0% as a rise or a fall', () => {
    // 1000 -> 1002 is +0.2%, which rounds to 0. It must read flat.
    expect(trendOf(1002, 1000)).toMatchObject({ percent: 0, direction: 'flat' });
    expect(trendOf(998, 1000)).toMatchObject({ percent: 0, direction: 'flat' });
  });

  it('handles a drop to zero', () => {
    expect(trendOf(0, 40)).toMatchObject({ percent: 100, direction: 'down' });
  });

  it('rounds rather than truncating', () => {
    // 100 -> 167 is 67%, not 66%.
    expect(trendOf(167, 100)).toMatchObject({ percent: 67, direction: 'up' });
  });
});

describe('trendWindows', () => {
  it('produces two adjacent windows of equal length', () => {
    const now = new Date('2026-08-29T00:00:00Z');
    const { currentStart, previousStart } = trendWindows(now);

    const day = 86_400_000;
    expect((now.getTime() - currentStart.getTime()) / day).toBe(TREND_WINDOW_DAYS);
    expect((currentStart.getTime() - previousStart.getTime()) / day).toBe(TREND_WINDOW_DAYS);
  });

  it('does not overlap — a row can only fall in one window', () => {
    const { currentStart, previousStart } = trendWindows(new Date('2026-08-29T00:00:00Z'));
    expect(previousStart.getTime()).toBeLessThan(currentStart.getTime());
  });
});
