// lib/admin/trend.ts

/**
 * Period-over-period change for a dashboard tile.
 *
 * The previous dashboard showed no trends at all — the ones that existed were
 * removed because they were invented numbers, which was the right call. These
 * are computed from real `created_at` timestamps, and the type deliberately
 * makes "we cannot say" a first-class answer rather than dressing it up as 0%.
 */

export const TREND_WINDOW_DAYS = 30;

export type Trend =
  | { kind: 'none' }
  | { kind: 'new'; current: number }
  | { kind: 'change'; percent: number; direction: 'up' | 'down' | 'flat'; current: number; previous: number };

/**
 * Compares two windows of equal length.
 *
 * A zero baseline does NOT become "+100%". Going from 0 to 3 is not a 100%
 * increase, it is the first three — reporting a percentage there is noise
 * dressed as signal, and it is exactly how a dashboard starts lying. That case
 * returns `new` so the UI can say "3 this month" and nothing more.
 */
export function trendOf(current: number, previous: number): Trend {
  if (previous === 0 && current === 0) return { kind: 'none' };
  if (previous === 0) return { kind: 'new', current };

  const change = ((current - previous) / previous) * 100;
  // Rounded before the direction is decided, so a change that displays as 0%
  // is never labelled as a rise or a fall.
  const percent = Math.round(change);

  return {
    kind: 'change',
    percent: Math.abs(percent),
    direction: percent > 0 ? 'up' : percent < 0 ? 'down' : 'flat',
    current,
    previous,
  };
}

/** The two window boundaries: [previousStart, currentStart, now]. */
export function trendWindows(now: Date = new Date()): {
  currentStart: Date;
  previousStart: Date;
} {
  const day = 86_400_000;
  return {
    currentStart: new Date(now.getTime() - TREND_WINDOW_DAYS * day),
    previousStart: new Date(now.getTime() - 2 * TREND_WINDOW_DAYS * day),
  };
}
