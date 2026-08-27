// next.config.ts
import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

// Without this plugin next-intl cannot locate i18n/request.ts.
const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  // Required by docker/Dockerfile, which copies .next/standalone.
  output: 'standalone',

  // NOTE: `experimental.ppr` and `experimental.dynamicIO` are canary-only.
  // They throw on the pinned stable release (next@15.1.0). Re-enable only
  // after moving to `next@canary`.

  images: {
    // Was `hostname: '**'`, which turned this app into an open image-resize
    // proxy for any host on the internet. Add only hosts you actually serve.
    remotePatterns: [
      { protocol: 'https', hostname: 'localhost' },
    ],
    formats: ['image/webp', 'image/avif'],
  },

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
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
