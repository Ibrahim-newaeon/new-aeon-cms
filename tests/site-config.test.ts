// tests/site-config.test.ts
//
// themes/<site>/site.config.json is what makes onboarding the second site a
// config file rather than a second copy of three scripts. It is also a 90-line
// JSON document with no schema behind it at edit time, so the checks that run
// on load are the only thing standing between a typo and a half-built pack.

import { describe, it, expect } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { normaliseSiteConfig, loadSiteConfig } from '../scripts/lib/site-config.mjs';
import { rewrite, extractBody, applyMediaReplacements } from '../scripts/extract-site-content.mjs';

const minimal = {
  name: 'Example',
  prefix: 'example',
  content: { open: '<main>', close: '</main>' },
  slugs: { 'index.html': '', 'about.html': 'about' },
  build: { cssOrder: ['css/a.css'], jsOrder: ['js/a.js'] },
};

describe('site config validation', () => {
  it('accepts a minimal config and fills the defaults in', () => {
    const config = normaliseSiteConfig(minimal, 'example');
    expect(config.locale).toBe('en');
    expect(config.content.stripSvg).toBe(true);
    expect(config.content.titleSeparator).toBe('|');
    expect(config.postSlugs).toEqual([]);
    expect(config.build.webfonts).toBeNull();
  });

  /**
   * Every one of these fails LATER and more confusingly if it is not caught
   * here — a missing marker yields "no pages found" with thirteen files
   * present, and a missing jsOrder throws inside the zip writer.
   */
  it.each([
    ['name', { ...minimal, name: undefined }],
    ['prefix', { ...minimal, prefix: '' }],
    ['content.open', { ...minimal, content: { close: '</main>' } }],
    ['content.close', { ...minimal, content: { open: '<main>' } }],
    ['slugs', { ...minimal, slugs: undefined }],
    ['an empty slugs map', { ...minimal, slugs: {} }],
    ['build.cssOrder', { ...minimal, build: { jsOrder: ['js/a.js'] } }],
    ['build.jsOrder', { ...minimal, build: { cssOrder: ['css/a.css'] } }],
  ])('refuses a config missing %s', (_label, raw) => {
    expect(() => normaliseSiteConfig(raw, 'example')).toThrow();
  });

  it('names the site and the field in the error, not just "invalid"', () => {
    expect(() => normaliseSiteConfig({ ...minimal, prefix: undefined }, 'acme')).toThrow(
      /acme\/site\.config\.json[\s\S]*prefix/
    );
  });

  it('refuses a media replacement with nothing to replace it with', () => {
    expect(() =>
      normaliseSiteConfig({ ...minimal, mediaReplacements: [{ missing: 'a.png' }] }, 'example')
    ).toThrow(/mediaReplacements/);
  });

  /** A site name reaches the filesystem, so it is checked before it is joined. */
  it.each(['../etc', 'Some Site', '', 'a/b'])('refuses %o as a site name', async (site) => {
    await expect(loadSiteConfig(site as string)).rejects.toThrow(/--site/);
  });

  it('says where to look when a site has no config', async () => {
    await expect(loadSiteConfig('not-a-real-site')).rejects.toThrow(/onboarding-a-site/);
  });
});

describe('the committed al-ai config', () => {
  it('loads, and matches the pack it belongs to', async () => {
    const config = await loadSiteConfig('al-ai');
    const manifest = JSON.parse(
      await fs.readFile(path.join(process.cwd(), 'themes', 'al-ai', 'theme.json'), 'utf8')
    );
    expect(config.name).toBe(manifest.name);
    expect(config.prefix).toBe('al-ai');
    expect(config.postSlugs).toContain('blog-post-sidebar');
  });

  /** Every file the build concatenates from the pack must actually be there. */
  it('names shim and stylesheet files that exist', async () => {
    const config = await loadSiteConfig('al-ai');
    const files = [
      ...config.build.shims.before,
      ...config.build.shims.after,
      ...config.build.packCss,
    ];
    expect(files.length).toBeGreaterThan(0);
    for (const rel of files) {
      await expect(
        fs.access(path.join(process.cwd(), 'themes', 'al-ai', rel))
      ).resolves.toBeUndefined();
    }
  });

  /** packPages are copied out of content/; a missing one publishes nothing. */
  it('names policy templates that exist', async () => {
    const config = await loadSiteConfig('al-ai');
    for (const file of Object.keys(config.packPages)) {
      await expect(
        fs.access(path.join(process.cwd(), 'themes', 'al-ai', 'content', file))
      ).resolves.toBeUndefined();
    }
  });
});

describe('extraction, driven by config', () => {
  const config = normaliseSiteConfig(
    {
      ...minimal,
      linkRewrites: { 'blog-archive.html': '/{locale}/blog' },
      mediaReplacements: [{ missing: 'gone.png', replacement: 'clip.mp4', as: 'video', label: 'Clip' }],
    },
    'example'
  );
  const opts = { locale: 'en', prefix: 'example' };

  it('takes the slice between the configured markers', () => {
    expect(extractBody('<head>x</head><main> body </main><footer>', config.content)).toBe('body');
  });

  it('returns null when the markers are not there, rather than the whole file', () => {
    expect(extractBody('<div>no markers</div>', config.content)).toBeNull();
  });

  it('rewrites inter-page links to the locale path', () => {
    expect(rewrite('<a href="about.html">A</a>', config, opts)).toContain('href="/en/about"');
  });

  /** The front page maps to /<locale>, with no slug segment. */
  it('points the home link at the locale root', () => {
    expect(rewrite('<a href="index.html">H</a>', config, opts)).toContain('href="/en"');
  });

  it('applies the extra link rewrites, locale substituted', () => {
    expect(rewrite('<a href="blog-archive.html">B</a>', config, opts)).toContain('href="/en/blog"');
  });

  it('moves media to the upload prefix, keeping the basename', () => {
    expect(rewrite('<img src="assets/img/deep/hero.png">', config, opts)).toContain(
      'src="/uploads/example/hero.png"'
    );
  });

  /** An <img> pointed at an mp4 renders its alt text, so the element changes. */
  it('swaps a missing image for a real video element', () => {
    const out = applyMediaReplacements(
      '<img src="/uploads/example/gone.png" class="x">',
      'example',
      config.mediaReplacements
    );
    expect(out).toContain('<video');
    expect(out).toContain('muted=""');
    expect(out).toContain('<source src="/uploads/example/clip.mp4" type="video/mp4">');
    expect(out).not.toContain('<img');
  });

  it('strips inline svg by default, because no paste mode keeps it', () => {
    expect(rewrite('<p>a</p><svg><text>Scroll</text></svg>', config, opts)).toBe('<p>a</p>');
  });

  it('keeps svg when a site opts out', () => {
    const keep = normaliseSiteConfig({ ...minimal, content: { ...minimal.content, stripSvg: false } }, 'example');
    expect(rewrite('<svg><text>x</text></svg>', keep, opts)).toContain('<svg>');
  });
});
