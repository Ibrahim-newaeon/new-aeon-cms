// next.config.ts
import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

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
  const raw = process.env.LEGACY_REDIRECTS;
  if (!raw) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // A typo here must not take the build down: the site is still correct
    // without its redirects, and a failed deploy helps nobody.
    console.warn('[next.config] LEGACY_REDIRECTS is not valid JSON — ignoring it.');
    return [];
  }

  if (!Array.isArray(parsed)) {
    console.warn('[next.config] LEGACY_REDIRECTS must be a JSON array — ignoring it.');
    return [];
  }

  const out: { source: string; destination: string; statusCode: 301 }[] = [];

  for (const entry of parsed) {
    const from = (entry as { from?: unknown })?.from;
    const to = (entry as { to?: unknown })?.to;
    if (typeof from !== 'string' || typeof to !== 'string') continue;

    /*
     * Both sides must be same-origin paths.
     *
     * `//evil.example` is a protocol-relative URL, not a path — a browser
     * follows it off-site. Accepting one here would turn a redirect table into
     * an open redirect, which is worth guarding even though only an operator
     * can set this variable.
     */
    const isPath = (s: string) => s.startsWith('/') && !s.startsWith('//');
    if (!isPath(from) || !isPath(to)) {
      console.warn(`[next.config] LEGACY_REDIRECTS entry skipped, not a local path: ${from} -> ${to}`);
      continue;
    }

    out.push({ source: from, destination: to, statusCode: 301 });
  }

  return out;
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
