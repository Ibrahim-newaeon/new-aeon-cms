import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import JSZip from 'jszip';
import { extractThemeZip, ThemeZipError } from '@/lib/themes/zip';
import { renderThemePage } from '@/lib/themes/render';
import { themeableKindForPath, themeManifestSchema } from '@/lib/themes/package';
import { removeThemeDir, themesRoot } from '@/lib/themes/store';
import { blocksToHtml } from '@/lib/themes/blocks-to-html';
import { isThemeDriverImplemented } from '@/lib/theme/driver';
import { settingsSchema } from '@/lib/settings-schema';

async function sampleZipBuffer(): Promise<Buffer> {
  const zipPath = path.join(process.cwd(), 'themes/samples/minimal.zip');
  return fs.readFile(zipPath);
}

describe('theme pack package', () => {
  it('maps marketing paths and reserves commerce', () => {
    expect(themeableKindForPath('/ar', ['ar', 'en'])).toBe('home');
    expect(themeableKindForPath('/en/about', ['ar', 'en'])).toBe('page');
    expect(themeableKindForPath('/ar/blog', ['ar', 'en'])).toBe('blog');
    expect(themeableKindForPath('/ar/cart', ['ar', 'en'])).toBeNull();
    expect(themeableKindForPath('/ar/checkout', ['ar', 'en'])).toBeNull();
    expect(themeableKindForPath('/ar/shop', ['ar', 'en'])).toBeNull();
    expect(themeableKindForPath('/ar/account', ['ar', 'en'])).toBeNull();
  });

  it('accepts a valid theme.json', () => {
    const parsed = themeManifestSchema.parse({
      name: 'Minimal',
      version: '1.0.0',
      templates: {
        layout: 'templates/layout.html',
        home: 'templates/home.html',
        page: 'templates/page.html',
      },
    });
    expect(parsed.name).toBe('Minimal');
  });

  it('allows html-pack in settings', () => {
    expect(isThemeDriverImplemented('html-pack')).toBe(true);
    const parsed = settingsSchema.parse({
      siteName: 'Shop',
      comingSoonMode: false,
      eCommerceEnabled: false,
      currency: 'JOD',
      themeDriver: 'html-pack',
    });
    expect(parsed.themeDriver).toBe('html-pack');
  });
});

describe('theme zip extract + render', () => {
  const ids: string[] = [];
  const prevDir = process.env.THEMES_DIR;

  beforeAll(async () => {
    process.env.THEMES_DIR = path.join(process.cwd(), '.tmp-verify', 'themes-test');
    await fs.mkdir(themesRoot(), { recursive: true });
  });

  afterAll(async () => {
    for (const id of ids) await removeThemeDir(id).catch(() => undefined);
    if (prevDir === undefined) delete process.env.THEMES_DIR;
    else process.env.THEMES_DIR = prevDir;
  });

  it('rejects zip without theme.json', async () => {
    const zip = new JSZip();
    zip.file('readme.txt', 'no manifest');
    const buf = Buffer.from(await zip.generateAsync({ type: 'uint8array' }));
    await expect(extractThemeZip(randomUUID(), buf)).rejects.toBeInstanceOf(ThemeZipError);
  });

  it('rejects path traversal and php files', async () => {
    const zip = new JSZip();
    zip.file('theme.json', JSON.stringify({
      name: 'Bad',
      version: '1',
      templates: { layout: 'templates/layout.html' },
    }));
    zip.file('templates/layout.html', '{{ content }}');
    zip.file('evil.php', '<?php');
    const buf = Buffer.from(await zip.generateAsync({ type: 'uint8array' }));
    await expect(extractThemeZip(randomUUID(), buf)).rejects.toBeInstanceOf(ThemeZipError);
  });

  it('extracts the sample pack and renders home', async () => {
    const id = randomUUID();
    ids.push(id);
    const manifest = await extractThemeZip(id, await sampleZipBuffer());
    expect(manifest.name).toBe('Minimal');

    const rendered = await renderThemePage(id, manifest, 'home', {
      locale: 'en',
      dir: 'ltr',
      site: { name: 'Demo Shop', description: 'Hello' },
      page: {
        title: 'Welcome',
        excerpt: 'A short lead',
        content: '<p>Body copy</p>',
        slug: 'home',
      },
      navigation: [{ label: 'About', url: '/en/about' }],
    });

    expect(rendered.html).toContain('Demo Shop');
    expect(rendered.html).toContain('Welcome');
    expect(rendered.html).toContain('Body copy');
    expect(rendered.html).toContain('About');
    expect(rendered.cssHrefs.some((h) => h.includes('/theme-assets/'))).toBe(true);
  });
});

describe('blocksToHtml', () => {
  it('serialises basic blocks and sanitises html blocks', () => {
    const html = blocksToHtml(
      [
        { type: 'heading', level: 2, text: 'Hi' },
        { type: 'paragraph', text: 'There' },
        { type: 'html', content: '<p>ok</p><script>bad()</script>' },
      ],
      'safe'
    );
    expect(html).toContain('<h2>Hi</h2>');
    expect(html).toContain('<p>There</p>');
    expect(html).toContain('<p>ok</p>');
    expect(html).not.toContain('script');
  });
});
