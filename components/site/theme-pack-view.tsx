// components/site/theme-pack-view.tsx
// Renders an HTML theme pack output inside the Next document shell.

import { headers } from 'next/headers';

/**
 * The nonce is not optional decoration — without it the pack has no JavaScript.
 *
 * middleware.ts sets `script-src 'self' 'nonce-…' 'strict-dynamic'`, and
 * 'strict-dynamic' tells a supporting browser to IGNORE 'self' entirely: only a
 * script carrying the nonce, or one injected by a script that did, is allowed
 * to run. A pack's bundle is same-origin, so it looks safe and is refused all
 * the same.
 *
 * The failure is quiet and reads like something else. Stylesheets are unaffected
 * — style-src has no 'strict-dynamic' — so the page arrives fully styled and
 * merely inert: a theme whose loading overlay never dismisses looks like a
 * broken loader, not a blocked script.
 *
 * Read here rather than passed in, so every route that renders a pack gets it
 * without having to remember. Same shape as components/site/tracking-scripts.tsx.
 */
export async function ThemePackView({
  html,
  cssHrefs = [],
  jsHrefs = [],
}: {
  html: string;
  cssHrefs?: string[];
  jsHrefs?: string[];
}) {
  const nonce = (await headers()).get('x-nonce') ?? undefined;

  return (
    <div data-test-id="theme-pack-view" data-theme-pack>
      {cssHrefs.map((href) => (
        <link key={href} rel="stylesheet" href={href} />
      ))}
      {/*
        suppressHydrationWarning is load-bearing, not noise suppression.

        This subtree is a theme pack's markup: server-rendered for SEO, then
        handed to the browser as a string. React cannot reconcile it, and on any
        mismatch it discards the server DOM and re-renders the whole subtree —
        which is fatal here for a reason that is not obvious. The pack's bundle
        is a `defer` script, so it runs BEFORE hydration and initialises against
        the server DOM: it lays "Scroll to Explore" around a circle, builds the
        badges, wires the sliders. React then replaces every one of those nodes
        with fresh ones and all of that work is thrown away, leaving raw text
        where a laid-out widget was a moment earlier.

        Telling React the content is generated outside its control is what this
        flag is for, and it stops the subtree being regenerated.
      */}
      <div suppressHydrationWarning dangerouslySetInnerHTML={{ __html: html }} />
      {jsHrefs.map((href) => (
        <script key={href} src={href} defer nonce={nonce} />
      ))}
    </div>
  );
}
