// components/admin/session-keeper.tsx
'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

const ACCESS_TTL_MS = 15 * 60 * 1000;
// Refresh two minutes early so a slow request never races the expiry.
const REFRESH_EVERY_MS = ACCESS_TTL_MS - 2 * 60 * 1000;

/**
 * Keeps the session alive while the panel is open.
 *
 * The middleware hand-off already recovers an expired session on the next
 * navigation, but that costs a redirect round-trip and breaks in-page fetches
 * (saving a form would 401 mid-edit). Refreshing on a timer means the access
 * token is renewed before anything notices.
 */
export function SessionKeeper({ loginPath }: { loginPath: string }) {
  const router = useRouter();
  const refreshing = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const refresh = async () => {
      if (refreshing.current || document.visibilityState === 'hidden') return;
      refreshing.current = true;
      try {
        const res = await fetch('/api/auth/refresh', {
          method: 'POST',
          credentials: 'same-origin',
        });
        if (!res.ok && !cancelled) {
          // Revoked, reused, or the account was disabled — stop retrying.
          router.replace(loginPath);
        }
      } catch {
        // Offline: leave it to the next tick rather than logging the user out.
      } finally {
        refreshing.current = false;
      }
    };

    const timer = window.setInterval(refresh, REFRESH_EVERY_MS);

    // Coming back to a tab that slept through a refresh window.
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [router, loginPath]);

  return null;
}
