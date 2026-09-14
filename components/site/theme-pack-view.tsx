// components/site/theme-pack-view.tsx
// Renders an HTML theme pack output inside the Next document shell.

import Script from 'next/script';
import { headers } from 'next/headers';

/**
 * Two things this component has to get right, and both are invisible when wrong.
 *
 * ── The nonce ───────────────────────────────────────────────────────────────
 * middleware.ts sets `script-src 'self' 'nonce-…' 'strict-dynamic'`, and
 * 'strict-dynamic' tells a supporting browser to IGNORE 'self': only a script
 * carrying the nonce, or one injected by a script that did, may run. A pack's
 * bundle is same-origin, which looks safe and is refused all the same.
 *
 * ── When the bundle runs ────────────────────────────────────────────────────
 * A plain <script defer> executes BEFORE React hydrates. A pack's bundle uses
 * that moment to measure and rewrite the DOM — splitting text into characters
 * to lay it around a circle, building badges, wiring sliders. React then
 * hydrates, cannot reconcile markup it never rendered, discards the server
 * nodes and re-renders the subtree. Every node the bundle touched is replaced,
 * and the work is gone: a laid-out widget reverts to raw text, a dismissed
 * loading overlay comes back.
 *
 * `afterInteractive` moves the bundle to after hydration, so it initialises the
 * DOM React has settled on and nothing is thrown away afterwards. Same strategy
 * components/site/tracking-scripts.tsx uses, for the same reason.
 *
 * suppressHydrationWarning was tried here first and does not help: React
 * applies it to text content one level deep, not to a structural mismatch.
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
        <Script key={href} src={href} strategy="afterInteractive" nonce={nonce} />
      ))}
    </div>
  );
}
