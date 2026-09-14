// lib/seo/legacy-redirects.ts
//
// Permanent redirects from a site's previous URLs, read from LEGACY_REDIRECTS.
//
// One parser, used from two places, because the value has to be honoured at
// RUNTIME and the obvious home for it does not work:
//
// `next.config.ts` can turn this into Next's own `redirects()`, but that file
// is evaluated by `next build` — inside docker/Dockerfile's builder stage,
// which starts from a bare image. A value set on the running container is
// invisible there, so the table was empty in every image ever built and every
// old URL 404'd. Declaring ARG LEGACY_REDIRECTS is necessary and was not
// sufficient: the platform also has to pass it to the build, and Railway did
// not, so the redirects still never appeared.
//
// middleware.ts runs per request and reads the real environment — the same way
// it reads JWT_REFRESH_SECRET, which demonstrably works in production. Putting
// the table there makes the variable behave like every other setting: set it,
// restart, done. No rebuild, and no dependency on how a platform treats build
// arguments.

export interface LegacyRedirect {
  from: string;
  to: string;
}

/**
 * Both sides must be same-origin paths.
 *
 * `//evil.example` is a protocol-relative URL, not a path — a browser follows
 * it off-site. Accepting one would turn a redirect table into an open
 * redirect, which is worth guarding even though only an operator can set this.
 */
const isLocalPath = (s: string) => s.startsWith('/') && !s.startsWith('//');

/**
 * Parse the variable into entries, dropping anything malformed.
 *
 * Never throws. A typo must not take a deployment down: the site is still
 * correct without its redirects, and a boot loop helps nobody. `onProblem`
 * exists so the caller can log what was dropped — silence is what let an empty
 * table look identical to one nobody configured.
 */
export function parseLegacyRedirects(
  raw: string | undefined,
  onProblem: (message: string) => void = () => {}
): LegacyRedirect[] {
  if (!raw) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    onProblem('LEGACY_REDIRECTS is not valid JSON — ignoring it.');
    return [];
  }

  if (!Array.isArray(parsed)) {
    onProblem('LEGACY_REDIRECTS must be a JSON array — ignoring it.');
    return [];
  }

  const out: LegacyRedirect[] = [];
  for (const entry of parsed) {
    const from = (entry as { from?: unknown })?.from;
    const to = (entry as { to?: unknown })?.to;
    if (typeof from !== 'string' || typeof to !== 'string') {
      onProblem('LEGACY_REDIRECTS entry skipped: from and to must both be strings.');
      continue;
    }
    if (!isLocalPath(from) || !isLocalPath(to)) {
      onProblem(`LEGACY_REDIRECTS entry skipped, not a local path: ${from} -> ${to}`);
      continue;
    }
    // A redirect to itself is a loop, and the browser reports it as one.
    if (from === to) {
      onProblem(`LEGACY_REDIRECTS entry skipped, points at itself: ${from}`);
      continue;
    }
    out.push({ from, to });
  }
  return out;
}

/**
 * A lookup that normalises the pathname itself.
 *
 * Deliberately not a Map. The old server was IIS, which matches paths
 * case-insensitively — two spellings of the same file are both in the wild and
 * both indexed — so keys are stored lower-cased. Handing back a Map makes that
 * the caller's problem to remember, and `map.get('/About.html')` then returns
 * undefined while looking perfectly correct. It caught the first test written
 * against it, which is a fair warning about the next caller.
 *
 * Earlier entries win, so a table listing both spellings behaves the way its
 * author meant.
 */
export interface LegacyRedirectLookup {
  /** Zero when unset or entirely malformed, so a caller can skip the work. */
  size: number;
  find(pathname: string): string | undefined;
}

export function legacyRedirectLookup(
  raw: string | undefined,
  onProblem?: (message: string) => void
): LegacyRedirectLookup {
  const map = new Map<string, string>();
  for (const { from, to } of parseLegacyRedirects(raw, onProblem)) {
    const key = from.toLowerCase();
    if (!map.has(key)) map.set(key, to);
  }
  return {
    size: map.size,
    find: (pathname) => map.get(pathname.toLowerCase()),
  };
}
