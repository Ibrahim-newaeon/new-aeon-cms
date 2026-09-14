// next.config.ts
import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';
import { parseLegacyRedirects } from './lib/seo/legacy-redirects';

// Without this plugin next-intl cannot locate i18n/request.ts.
const withNextIntl = createNextIntlPlugin();

/**
 * Allows next/image to optimise media served from the configured bucket.
 * Reads S3_PUBLIC_URL, falling back to S3_ENDPOINT. Returns nothing when
 * neither is set, so a local-storage install adds no host.
 *
 * IMPORTANT: this file is evaluated at BUILD time and the result is baked into
 * the build. `S3_PUBLIC_URL` must therefore be present when `next build` runs,
 * not only at runtime. Supplying it only to the running container leaves the
 * bucket host out of remotePatterns, and every bucket-hosted image 400s — a
 * worse failure than the plain <img> tags this replaced.
 */
function mediaRemotePattern(): { protocol: 'http' | 'https'; hostname: string }[] {
  const base = process.env.S3_PUBLIC_URL || process.env.S3_ENDPOINT;
  if (!base) return [];

  try {
    const { protocol, hostname } = new URL(base);
    return [{ protocol: protocol === 'http:' ? 'http' : 'https', hostname }];
  } catch {
    // A malformed URL is caught properly by lib/env.ts at boot; the build
    // should not die here for it.
    return [];
  }
}

/**
 * Permanent redirects from a site's previous URLs, read from LEGACY_REDIRECTS.
 *
 * A site rebuilt onto this CMS arrives with inbound links and accumulated
 * ranking pointing at addresses it no longer serves — `/about.html` where the
 * CMS answers `/en/about`. Without a redirect those become 404s and the
 * ranking goes with them.
 *
 * The map lives in an environment variable rather than in this file because
 * one repository serves several sites: hard-coding one client's old paths here
 * would make every other client carry them. Each deployment declares its own.
 *
 * Format — a JSON array, paths only:
 *
 *   LEGACY_REDIRECTS='[{"from":"/about.html","to":"/en/about"}]'
 *
 * 301 rather than `permanent: true`, which emits 308. Both are permanent and
 * both pass ranking, but 301 is what the tooling and the people reading the
 * access log expect from a content move.
 *
 * Like the rest of this file it is read at BUILD time, so the variable has to
 * be present when `next build` runs, not only in the running container.
 */
export function legacyRedirects(): { source: string; destination: string; statusCode: 301 }[] {
  /*
   * Kept, but no longer the mechanism anyone should rely on.
   *
   * This file is evaluated by `next build`, so it only sees LEGACY_REDIRECTS
   * when the build itself is given it — inside docker/Dockerfile that needs
   * both the ARG declaration and a platform that passes the build argument.
   * Railway does not, which is why the table was empty in every image and
   * every old URL 404'd.
   *
   * middleware.ts now does this at runtime from the same parser, which works
   * wherever the variable is merely set on the service. This remains for a
   * build that DOES supply it — the two agree, so a path matched here simply
   * never reaches the middleware.
   */
  return parseLegacyRedirects(process.env.LEGACY_REDIRECTS, (message) =>
    console.warn(`[next.config] ${message}`)
  ).map(({ from, to }) => ({ source: from, destination: to, statusCode: 301 as const }));
}

const nextConfig: NextConfig = {
  /**
   * Required by docker/Dockerfile, which copies .next/standalone — so it stays
   * the default and a plain `npm run build` is unchanged.
   *
   * `next start` refuses to serve a standalone build ("does not work with
   * output: standalone"), and the browser suite's webServer is exactly that.
   * It ran anyway on a warning, which is a bad thing to leave in a test
   * harness: the next Next release could turn it into a hard failure and the
   * suite would break for a reason unrelated to any change. `npm run test:e2e`
   * sets NEXT_STANDALONE=0 so the build it tests is one `next start` supports.
   */
  output: process.env.NEXT_STANDALONE === '0' ? undefined : 'standalone',

  // NOTE: `experimental.ppr` and `experimental.dynamicIO` are canary-only.
  // They throw on the pinned stable release (next@15.1.0). Re-enable only
  // after moving to `next@canary`.

  images: {
    // Was `hostname: '**'`, which turned this app into an open image-resize
    // proxy for any host on the internet. Add only hosts you actually serve.
    // The media bucket is derived from env rather than hardcoded so it stays
    // correct across environments — and stays absent when unconfigured.
    remotePatterns: [
      { protocol: 'https', hostname: 'localhost' },
      ...mediaRemotePattern(),
    ],
    formats: ['image/webp', 'image/avif'],
  },

  async redirects() {
    return legacyRedirects();
  },

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          // SAMEORIGIN, matching frame-ancestors 'self' in middleware.ts:
          // the admin's theme preview frames the storefront. Older browsers
          // read this header and ignore frame-ancestors, so the two have to
          // agree or the preview breaks only on those.
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
