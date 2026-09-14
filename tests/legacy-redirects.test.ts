// tests/legacy-redirects.test.ts
//
// LEGACY_REDIRECTS is read at build time and baked into the build, so a bad
// value is not something an operator finds out about from a running site —
// they find out from 404s in the access log weeks later. These cover the
// shapes a hand-edited environment variable actually arrives in.

import { describe, it, expect, afterEach } from 'vitest';
import { legacyRedirects } from '../next.config';

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
