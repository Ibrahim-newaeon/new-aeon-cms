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
      <div dangerouslySetInnerHTML={{ __html: html }} />
      {jsHrefs.map((href) => (
        <script key={href} src={href} defer nonce={nonce} />
      ))}
    </div>
  );
}
