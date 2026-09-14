// tests/legacy-redirects.test.ts
//
// LEGACY_REDIRECTS rescues the URLs a previous site was indexed under, so a
// bad value is not something an operator finds out about from a running site —
// they find out from 404s in the access log weeks later. These cover the
// shapes a hand-edited environment variable actually arrives in.
//
// The table is applied by middleware.ts at RUNTIME. It began as Next's own
// build-time `redirects()`, which never fired once: next.config.ts is
// evaluated by `next build`, inside a Docker builder stage that cannot see a
// variable set on the running container. legacyRedirects() is still exported
// for a build that IS given the value, and both paths share one parser, so
// these cases hold for either.

import { describe, it, expect, afterEach } from 'vitest';
import { legacyRedirects } from '../next.config';
import { legacyRedirectLookup } from '@/lib/seo/legacy-redirects';

const prev = process.env.LEGACY_REDIRECTS;

function withValue(raw: string | undefined) {
  if (raw === undefined) delete process.env.LEGACY_REDIRECTS;
  else process.env.LEGACY_REDIRECTS = raw;
  return legacyRedirects();
}

afterEach(() => {
  if (prev === undefined) delete process.env.LEGACY_REDIRECTS;
  else process.env.LEGACY_REDIRECTS = prev;
});

describe('legacyRedirects', () => {
  it('is empty when the variable is unset, so other sites carry nothing', () => {
    expect(withValue(undefined)).toEqual([]);
  });

  it('maps an entry to a 301, not the 308 that `permanent: true` would give', () => {
    expect(withValue('[{"from":"/about.html","to":"/en/about"}]')).toEqual([
      { source: '/about.html', destination: '/en/about', statusCode: 301 },
    ]);
  });

  it('keeps every entry of a full site map', () => {
    const raw = JSON.stringify([
      { from: '/index.html', to: '/en' },
      { from: '/services.html', to: '/en/services' },
      { from: '/contact.html', to: '/en/contact' },
    ]);
    expect(withValue(raw)).toHaveLength(3);
  });

  /**
   * The build must survive a typo. A site with no redirects still serves every
   * page; a site that will not build serves none.
   */
  it('ignores malformed JSON rather than failing the build', () => {
    expect(withValue('{not json')).toEqual([]);
  });

  it('ignores a JSON value that is not an array', () => {
    expect(withValue('{"from":"/a","to":"/b"}')).toEqual([]);
  });

  it('skips entries missing either side', () => {
    const raw = JSON.stringify([
      { from: '/a.html' },
      { to: '/en/b' },
      { from: '/c.html', to: '/en/c' },
    ]);
    expect(withValue(raw)).toEqual([
      { source: '/c.html', destination: '/en/c', statusCode: 301 },
    ]);
  });

  /**
   * `//evil.example` is a protocol-relative URL, not a path — a browser follows
   * it off-site. Letting one through would make this table an open redirect.
   */
  it('refuses a protocol-relative destination', () => {
    expect(withValue('[{"from":"/a.html","to":"//evil.example"}]')).toEqual([]);
  });

  it('refuses an absolute destination', () => {
    expect(withValue('[{"from":"/a.html","to":"https://evil.example"}]')).toEqual([]);
  });

  it('refuses a source that is not a local path', () => {
    expect(withValue('[{"from":"https://al-ai.ai/a.html","to":"/en/a"}]')).toEqual([]);
  });

  it('keeps the good entries when one is bad', () => {
    const raw = JSON.stringify([
      { from: '/good.html', to: '/en/good' },
      { from: '/bad.html', to: '//evil.example' },
    ]);
    expect(withValue(raw)).toEqual([
      { source: '/good.html', destination: '/en/good', statusCode: 301 },
    ]);
  });

  /**
   * Next matches `source` case-sensitively, so a mixed-case filename needs its
   * lowercase spelling listed separately — which is what the al-ai.ai map does
   * for the three pages whose filenames carry capitals.
   */
  it('treats two spellings of one filename as two entries', () => {
    const raw = JSON.stringify([
      { from: '/automated-decision-making-and-BPA.html', to: '/en/automated-decision-making-and-bpa' },
      { from: '/automated-decision-making-and-bpa.html', to: '/en/automated-decision-making-and-bpa' },
    ]);
    const out = withValue(raw);
    expect(out).toHaveLength(2);
    expect(out.every((r) => r.destination === '/en/automated-decision-making-and-bpa')).toBe(true);
  });
});

describe('the runtime lookup middleware uses', () => {
  const table = JSON.stringify([
    { from: '/about.html', to: '/en/about' },
    { from: '/automated-decision-making-and-BPA.html', to: '/en/automated-decision-making-and-bpa' },
  ]);

  it('finds a path by its exact spelling', () => {
    expect(legacyRedirectLookup(table).find('/about.html')).toBe('/en/about');
  });

  /**
   * The previous server was IIS, which matches paths case-insensitively, so
   * both spellings of a file are in the wild and both are indexed. A
   * case-sensitive table would rescue one and 404 the other.
   */
  it('matches case-insensitively, as the old server did', () => {
    const map = legacyRedirectLookup(table);
    expect(map.find('/automated-decision-making-and-bpa.html')).toBe(
      '/en/automated-decision-making-and-bpa'
    );
    expect(map.find('/About.html')).toBe('/en/about');
  });

  it('leaves a path it does not know alone', () => {
    expect(legacyRedirectLookup(table).find('/en/about')).toBeUndefined();
  });

  /** A table listing both spellings must behave the way its author meant. */
  it('lets the first of two spellings win', () => {
    const map = legacyRedirectLookup(
      JSON.stringify([
        { from: '/A.html', to: '/en/first' },
        { from: '/a.html', to: '/en/second' },
      ])
    );
    expect(map.find('/a.html')).toBe('/en/first');
  });

  it('is empty when the variable is unset, so the check short-circuits', () => {
    expect(legacyRedirectLookup(undefined).size).toBe(0);
    expect(legacyRedirectLookup('').size).toBe(0);
  });

  /** A redirect to itself is a loop the browser reports as one. */
  it('drops an entry pointing at itself', () => {
    const problems: string[] = [];
    const map = legacyRedirectLookup(
      JSON.stringify([{ from: '/x.html', to: '/x.html' }]),
      (m) => problems.push(m)
    );
    expect(map.size).toBe(0);
    expect(problems[0]).toContain('points at itself');
  });

  /** Silence is what made the original failure invisible for weeks. */
  it('reports what it dropped rather than swallowing it', () => {
    const problems: string[] = [];
    legacyRedirectLookup('not json', (m) => problems.push(m));
    expect(problems[0]).toContain('not valid JSON');
  });

  it('still refuses a protocol-relative destination', () => {
    const map = legacyRedirectLookup(JSON.stringify([{ from: '/a.html', to: '//evil.example' }]));
    expect(map.size).toBe(0);
  });
});
