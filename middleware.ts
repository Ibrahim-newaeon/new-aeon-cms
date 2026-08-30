// middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifyAccessToken } from '@/lib/auth/session';
import { jwtVerify } from 'jose';

// Read directly from process.env, not lib/env — middleware runs on the Edge
// runtime and must stay free of Node-only imports.
const ADMIN_PATH = process.env.ADMIN_PATH || '/admin';
const DEFAULT_LOCALE = process.env.DEFAULT_LOCALE || 'ar';
const LOCALES = (process.env.AVAILABLE_LOCALES || 'ar,en').split(',').map((l) => l.trim());

const PUBLIC_FILE = /\.[^/]+$/;

const REFRESH_SECRET = new TextEncoder().encode(process.env.JWT_REFRESH_SECRET);

/**
 * Signature-and-expiry check only. Whether the token has been revoked or reused
 * lives in the database, which the Edge runtime cannot reach — that check
 * happens in /api/auth/refresh. This is just enough to decide between
 * "try to refresh" and "send to login".
 */
async function refreshTokenLooksValid(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  try {
    await jwtVerify(token, REFRESH_SECRET, { clockTolerance: 60 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Nonce-based CSP. Next.js reads the `content-security-policy` header we set on
 * the *request* and stamps the same nonce onto its own script tags, so no
 * 'unsafe-inline' is needed for scripts.
 *
 * 'unsafe-inline' remains on style-src: Next injects inline <style> for CSS-in-JS
 * and route transitions, and there is no nonce plumbing for those.
 */
function buildCsp(nonce: string, isDev: boolean): string {
  return [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' blob: data: https:`,
    `font-src 'self' data:`,
    // Analytics beacons. 'strict-dynamic' handles SCRIPT loading (a nonced
    // loader may inject further scripts), but XHR/fetch/sendBeacon targets
    // still need to be listed here or the events are silently dropped.
    `connect-src 'self' https://www.google-analytics.com https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com https://connect.facebook.net https://analytics.tiktok.com https://tr.snapchat.com https://sc-static.net${isDev ? ' ws: wss:' : ''}`,
    // Video blocks embed these hosts; default-src 'self' would block them.
    `frame-src 'self' https://www.youtube-nocookie.com https://player.vimeo.com https://www.googletagmanager.com`,
    /**
     * 'self', not 'none': the Settings theme editor previews the real
     * storefront in an iframe, and 'none' blocks that as surely as it blocks a
     * hostile site.
     *
     * The clickjacking protection this exists for is unchanged — every OTHER
     * origin is still refused. Framing ourselves is not an attack: it would
     * require already controlling a page on this origin, at which point the
     * attacker has more than framing.
     */
    `frame-ancestors 'self'`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `upgrade-insecure-requests`,
  ].join('; ');
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const nonce = crypto.randomUUID().replace(/-/g, '');
  const csp = buildCsp(nonce, process.env.NODE_ENV === 'development');

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('content-security-policy', csp);

  const withCsp = (response: NextResponse) => {
    response.headers.set('content-security-policy', csp);
    return response;
  };

  const next = () => withCsp(NextResponse.next({ request: { headers: requestHeaders } }));

  if (PUBLIC_FILE.test(pathname)) return next();

  // Not locale-prefixed; must not be rewritten to /ar/coming-soon.
  if (pathname === '/coming-soon') return next();

  // API routes authenticate themselves via lib/auth/api-guard — middleware
  // cannot, because it must not import Node-only modules. Still apply CSP.
  if (pathname.startsWith('/api/')) return next();

  if (pathname.startsWith(ADMIN_PATH)) {
    // The screens someone locked out has to be able to reach. `forgot` and
    // `reset` are the whole point of self-service recovery: guarding them
    // bounces the user to the login page they cannot get past.
    const UNAUTHENTICATED_ADMIN_ROUTES = [
      `${ADMIN_PATH}/login`,
      `${ADMIN_PATH}/forgot`,
      `${ADMIN_PATH}/reset`,
    ];
    if (UNAUTHENTICATED_ADMIN_ROUTES.includes(pathname)) return next();

    const accessToken = request.cookies.get('access_token')?.value;
    const refreshToken = request.cookies.get('refresh_token')?.value;

    // The access token lives 15 minutes; the refresh token lives 7 days. When
    // only the short one has expired, hand off to the refresh route rather than
    // dumping the user at the login screen — that was the behaviour that made
    // the panel log you out every quarter of an hour.
    const toRefreshOrLogin = async () => {
      if (await refreshTokenLooksValid(refreshToken)) {
        const url = new URL('/api/auth/refresh', request.url);
        url.searchParams.set('next', pathname + request.nextUrl.search);
        return withCsp(NextResponse.redirect(url));
      }
      return withCsp(NextResponse.redirect(new URL(`${ADMIN_PATH}/login`, request.url)));
    };

    if (!accessToken) return toRefreshOrLogin();

    try {
      const payload = await verifyAccessToken(accessToken);
      requestHeaders.set('x-user-id', payload.sub);
      requestHeaders.set('x-user-role', payload.role);
      return next();
    } catch {
      return toRefreshOrLogin();
    }
  }

  // Locale routing. Without this, `/` 404s: every public page lives under
  // /[locale], and nothing previously redirected the bare root.
  const hasLocale = LOCALES.some(
    (locale) => pathname === `/${locale}` || pathname.startsWith(`/${locale}/`)
  );

  if (!hasLocale) {
    const url = request.nextUrl.clone();
    url.pathname = `/${DEFAULT_LOCALE}${pathname === '/' ? '' : pathname}`;
    return withCsp(NextResponse.redirect(url));
  }

  return next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
