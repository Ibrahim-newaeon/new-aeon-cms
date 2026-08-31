'use client';

import { Moon, Sun } from 'lucide-react';
import { THEME_COOKIE, THEME_COOKIE_MAX_AGE } from '@/lib/theme/visitor-mode';

/**
 * Lets a visitor switch between the skin's two variants.
 *
 * ── Why the icons are swapped in CSS and not in React state ────────────────
 * Under "follow the visitor's device" the server cannot know which variant a
 * visitor is seeing — that is decided by a media query in their browser. Any
 * JS-derived icon would therefore render one thing on the server and possibly
 * the other after hydration: a hydration mismatch, and a visible icon flip on
 * every page load.
 *
 * So BOTH icons are rendered and the SAME three-state cascade that picks the
 * theme also picks the icon (see .theme-toggle in globals.css). The correct
 * icon is right in the first painted frame, with no JS involved at all.
 *
 * The click handler sets the attribute directly rather than re-fetching: every
 * variant's CSS is already on the page, so switching is one attribute write and
 * the repaint is instant. The cookie is written so the SERVER stamps the same
 * choice on the next navigation, which is what keeps it from flashing back.
 */
export function ThemeToggle({ locale }: { locale: 'ar' | 'en' }) {
  const ar = locale === 'ar';

  const toggle = () => {
    const root = document.documentElement;
    const stamped = root.dataset.theme;
    // No stamp means the media query is deciding, so ask it what it decided.
    const isDark =
      stamped === 'dark' ||
      (!stamped && window.matchMedia('(prefers-color-scheme: dark)').matches);

    const next = isDark ? 'light' : 'dark';
    root.dataset.theme = next;
    document.cookie = `${THEME_COOKIE}=${next};path=/;max-age=${THEME_COOKIE_MAX_AGE};samesite=lax`;
  };

  return (
    <button
      type="button"
      onClick={toggle}
      // Describes the control, not the current state: a state-dependent label
      // would need JS to be correct and would drift from the CSS-driven icon.
      aria-label={ar ? 'التبديل بين الوضع الفاتح والداكن' : 'Switch between light and dark'}
      data-test-id="theme-toggle"
      className="theme-toggle rounded-full p-1.5 hover:bg-site-surface-raised sm:p-2"
    >
      <Moon size={20} aria-hidden="true" className="tt-to-dark" />
      <Sun size={20} aria-hidden="true" className="tt-to-light" />
    </button>
  );
}
