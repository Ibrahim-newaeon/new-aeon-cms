// tests/al-ai-theme.test.ts
//
// Covers the al-ai.ai theme pack's templates and partials — the part of the
// pack that is committed. The CSS/JS bundle is assembled from a source drop
// outside git by scripts/build-theme-pack.mjs, so it is not exercised here;
// what is exercised is every template the renderer can select, plus the two
// shapes that are easy to get wrong: a page with no content, and a blog with
// no posts.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import JSZip from 'jszip';
import { extractThemeZip } from '@/lib/themes/zip';
import { renderThemePage } from '@/lib/themes/render';
import { themeManifestSchema } from '@/lib/themes/package';
import { removeThemeDir, themesRoot } from '@/lib/themes/store';

const PACK_DIR = path.join(process.cwd(), 'themes', 'al-ai');

/**
 * The committed pack plus a token stylesheet, so renderThemePage() finds an
 * assets directory and reports a css href the way it would in production.
 */
async function packZip(): Promise<Buffer> {
  const zip = new JSZip();
  zip.file('theme.json', await fs.readFile(path.join(PACK_DIR, 'theme.json')));
  for (const dir of ['templates', 'partials']) {
    for (const name of await fs.readdir(path.join(PACK_DIR, dir))) {
      zip.file(`${dir}/${name}`, await fs.readFile(path.join(PACK_DIR, dir, name)));
    }
  }
  zip.file('assets/al-ai.css', await fs.readFile(path.join(PACK_DIR, 'assets', 'loader.css')));
  zip.file('assets/al-ai.js', '/* bundle is built by scripts/build-theme-pack.mjs */');
  return Buffer.from(await zip.generateAsync({ type: 'uint8array' }));
}

const baseCtx = {
  locale: 'en' as const,
  dir: 'ltr' as const,
  site: { name: 'al-ai.ai', description: 'AI solutions' },
};

describe('al-ai theme pack', () => {
  const ids: string[] = [];
  const prevDir = process.env.THEMES_DIR;
  let id: string;
  let manifest: Awaited<ReturnType<typeof extractThemeZip>>;

  beforeAll(async () => {
    process.env.THEMES_DIR = path.join(process.cwd(), '.tmp-verify', 'themes-al-ai');
    await fs.mkdir(themesRoot(), { recursive: true });
    id = randomUUID();
    ids.push(id);
    manifest = await extractThemeZip(id, await packZip());
  });

  afterAll(async () => {
    for (const i of ids) await removeThemeDir(i).catch(() => undefined);
    if (prevDir === undefined) delete process.env.THEMES_DIR;
    else process.env.THEMES_DIR = prevDir;
  });

  it('ships a manifest the CMS accepts, naming all four templates', () => {
    const parsed = themeManifestSchema.parse(manifest);
    expect(parsed.name).toBe('al-ai.ai');
    expect(parsed.templates.home).toBe('templates/home.html');
    expect(parsed.templates.page).toBe('templates/page.html');
    expect(parsed.templates.post).toBe('templates/post.html');
    expect(parsed.templates.blog).toBe('templates/blog.html');
  });

  it('renders home with the page body, chrome and a loader', async () => {
    const { html, cssHrefs } = await renderThemePage(id, manifest, 'home', {
      ...baseCtx,
      page: { title: 'Home', content: '<section id="hero">Intelligence</section>' },
    });

    expect(html).toContain('Intelligence');
    expect(html).toContain('id="tt-header"');
    expect(html).toContain('id="tt-footer"');
    expect(html).toContain('id="al-loader"');
    expect(cssHrefs.some((h) => h.includes('/theme-assets/'))).toBe(true);
  });

  it('resolves chrome images through the asset filter, not a bare path', async () => {
    const { html } = await renderThemePage(id, manifest, 'home', {
      ...baseCtx,
      page: { title: 'Home', content: '' },
    });

    expect(html).toContain(`/theme-assets/${id}/assets/img/al-ai.png`);
    expect(html).not.toContain('src="assets/img/');
  });

  it('links Blog, Services and the two policy pages under the active locale', async () => {
    const { html } = await renderThemePage(id, manifest, 'page', {
      ...baseCtx,
      page: { title: 'About', content: '<p>Who we are</p>', slug: 'about' },
    });

    expect(html).toContain('href="/en/blog"');
    expect(html).toContain('href="/en/services"');
    expect(html).toContain('href="/en/privacy-policy"');
    expect(html).toContain('href="/en/terms-and-conditions"');
    // The six service pages hang off the Services dropdown.
    expect(html).toContain('href="/en/behavioral-intelligence"');
  });

  it('marks the current page active in the header', async () => {
    const { html } = await renderThemePage(id, manifest, 'page', {
      ...baseCtx,
      page: { title: 'Contact', content: '<p>Reach us</p>', slug: 'contact' },
    });

    expect(html).toMatch(/<li class="active">\s*<a href="\/en\/contact">Contact<\/a>/);
  });

  /**
   * The front page has no slug in its URL but IS stored under one: the route
   * looks up 'home' and passes that to the renderer. A blank test therefore
   * matched nothing and Home was the one item that never lit up.
   */
  it('marks Home active on the front page, which is stored under slug home', async () => {
    const { html } = await renderThemePage(id, manifest, 'home', {
      ...baseCtx,
      page: { title: 'Home', content: '<p>x</p>', slug: 'home' },
    });

    expect(html).toMatch(/<li class="active">\s*<a href="\/en">Home<\/a>/);
  });

  it('appends CMS navigation items after the fixed ones', async () => {
    const { html } = await renderThemePage(id, manifest, 'page', {
      ...baseCtx,
      page: { title: 'About', content: '<p>x</p>', slug: 'about' },
      navigation: [{ label: 'Careers', url: '/en/careers' }],
    });

    expect(html).toContain('href="/en/careers"');
    expect(html).toContain('Careers');
  });

  it('falls back to the title when a page has no content yet', async () => {
    const { html } = await renderThemePage(id, manifest, 'page', {
      ...baseCtx,
      page: { title: 'Terms & Conditions', excerpt: 'How we work', content: '', slug: 'terms' },
    });

    expect(html).toContain('ph-caption-title');
    expect(html).toContain('Terms &amp; Conditions');
    expect(html).toContain('How we work');
  });

  it('renders a post with a link back to the blog index', async () => {
    const { html } = await renderThemePage(id, manifest, 'post', {
      ...baseCtx,
      page: { title: 'Agentic AI in retail', content: '<p>Body</p>', slug: 'agentic-ai-retail' },
    });

    expect(html).toContain('Agentic AI in retail');
    expect(html).toContain('<p>Body</p>');
    expect(html).toContain('href="/en/blog"');
  });

  it('lists posts on the blog index', async () => {
    const { html } = await renderThemePage(id, manifest, 'blog', {
      ...baseCtx,
      page: { title: 'Blog', content: '', slug: 'blog' },
      posts: [
        { title: 'First post', excerpt: 'Lead in', url: '/en/blog/first-post' },
        { title: 'Second post', excerpt: null, url: '/en/blog/second-post' },
      ],
    });

    expect(html).toContain('href="/en/blog/first-post"');
    expect(html).toContain('Lead in');
    expect(html).toContain('Second post');
    expect(html).not.toContain('No posts published yet');
  });

  it('says so plainly when the blog has no posts', async () => {
    const { html } = await renderThemePage(id, manifest, 'blog', {
      ...baseCtx,
      page: { title: 'Blog', content: '', slug: 'blog' },
      posts: [],
    });

    expect(html).toContain('No posts published yet');
  });

  /**
   * Liquid has no {# #} comment form — that is Jinja, and liquidjs prints it
   * verbatim. The first build shipped eight such blocks and every one of them
   * appeared on the live page as a paragraph of implementation notes above the
   * header. Nothing failed; it simply rendered.
   */
  it('leaks no comment markers of any dialect into the page', async () => {
    for (const kind of ['home', 'page', 'post', 'blog'] as const) {
      const { html } = await renderThemePage(id, manifest, kind, {
        ...baseCtx,
        page: { title: 'T', content: '<p>c</p>', slug: 's' },
        posts: [{ title: 'P', excerpt: 'e', url: '/en/blog/p' }],
      });
      expect(html).not.toContain('{#');
      expect(html).not.toContain('#}');
      expect(html).not.toContain('{%');
      expect(html).not.toContain('comment %}');
    }
  });

  /**
   * ThemePackView injects the rendered HTML with dangerouslySetInnerHTML, and
   * innerHTML never executes <script>. A script tag in a template is therefore
   * dead code that looks alive — the bundle is the only path that runs.
   */
  it('keeps every script out of the templates', async () => {
    for (const kind of ['home', 'page', 'post', 'blog'] as const) {
      const { html } = await renderThemePage(id, manifest, kind, {
        ...baseCtx,
        page: { title: 'T', content: '', slug: 's' },
      });
      expect(html).not.toMatch(/<script/i);
    }
  });
});
