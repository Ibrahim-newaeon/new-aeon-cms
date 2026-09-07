// lib/media/download-url.ts
// Defence in depth for /api/media/[id]/download — only fetch URLs our storage
// could have produced.

import { env } from '@/lib/env';

const LOCAL_PREFIX = '/uploads/';

/**
 * Returns true when `url` is a relative /uploads path or an absolute URL under
 * the configured public storage origin / app origin uploads.
 */
export function isAllowedMediaDownloadUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;

  if (trimmed.startsWith(LOCAL_PREFIX) && !trimmed.includes('..')) return true;

  if (env.S3_PUBLIC_URL) {
    const base = env.S3_PUBLIC_URL.replace(/\/+$/, '');
    if (trimmed.startsWith(`${base}/`)) return true;
  }

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const u = new URL(trimmed);
      const app = new URL(env.NEXT_PUBLIC_APP_URL);
      if (u.host === app.host && u.pathname.startsWith(LOCAL_PREFIX) && !u.pathname.includes('..')) {
        return true;
      }
    } catch {
      return false;
    }
  }

  return false;
}

/**
 * Resolve a stored media URL to an absolute fetch target, or null if blocked.
 */
export function resolveMediaDownloadSource(
  storedUrl: string,
  requestUrl: string
): string | null {
  if (!isAllowedMediaDownloadUrl(storedUrl)) return null;

  if (/^https?:\/\//i.test(storedUrl)) return storedUrl;

  try {
    return new URL(storedUrl, requestUrl).toString();
  } catch {
    return null;
  }
}
