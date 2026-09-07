import { describe, it, expect } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import JSZip from 'jszip';
import {
  convertPhpSource,
  convertPhpThemeZip,
  mapPhpThemePath,
} from '@/lib/themes/php-convert';
import { renderThemePage } from '@/lib/themes/render';
import { installThemePackFiles } from '@/lib/themes/install-pack';
import { removeThemeDir, themesRoot } from '@/lib/themes/store';
import { randomUUID } from 'node:crypto';

describe('mapPhpThemePath', () => {
  it('maps WordPress theme files to pack paths', () => {
    expect(mapPhpThemePath('header.php')).toBe('partials/header.html');
    expect(mapPhpThemePath('footer.php')).toBe('partials/footer.html');
    expect(mapPhpThemePath('index.php')).toBe('templates/home.html');
    expect(mapPhpThemePath('page.php')).toBe('templates/page.html');
    expect(mapPhpThemePath('single.php')).toBe('templates/post.html');
    expect(mapPhpThemePath('archive.php')).toBe('templates/blog.html');
    expect(mapPhpThemePath('style.css')).toBe('assets/style.css');
  });

  it('skips functions.php and includes', () => {
    expect(mapPhpThemePath('functions.php')).toBeNull();
    expect(mapPhpThemePath('inc/helpers.php')).toBeNull();
  });
});

describe('convertPhpSource', () => {
  it('rewrites common WordPress tags to Liquid', () => {
    const { html, warnings } = convertPhpSource(
      `<?php get_header(); ?><h1><?php the_title(); ?></h1><div><?php the_content(); ?></div><?php get_footer(); ?>`
    );
    expect(html).toContain(`{% render 'partials/header.html' %}`);
    expect(html).toContain('{{ page.title }}');
    expect(html).toContain('{{ page.content }}');
    expect(html).toContain(`{% render 'partials/footer.html' %}`);
    expect(html).not.toMatch(/<\?php/);
    expect(warnings.length).toBe(0);
  });

  it('comments out unmapped PHP instead of executing it', () => {
    const { html, warnings } = convertPhpSource(`<p><?php custom_thing(1+1); ?></p>`);
    expect(html).toContain('<!-- unconverted-php:');
    expect(html).not.toContain('custom_thing');
    expect(warnings.some((w) => w.includes('remaining PHP'))).toBe(true);
  });
});

describe('convertPhpThemeZip', () => {
  it('converts the sample PHP starter into a renderable HTML pack', async () => {
    const zipPath = path.join(process.cwd(), 'themes/samples/php-starter.zip');
    const buf = await fs.readFile(zipPath);
    const converted = await convertPhpThemeZip(buf);

    expect(converted.manifest.name).toBe('PHP Starter');
    expect(converted.files.has('templates/layout.html')).toBe(true);
    expect(converted.files.has('templates/home.html')).toBe(true);
    expect(converted.files.has('partials/header.html')).toBe(true);
    expect(converted.files.has('assets/style.css')).toBe(true);
    expect(converted.warnings.some((w) => w.includes('functions.php') || w.includes('Skipped'))).toBe(
      true
    );

    const prev = process.env.THEMES_DIR;
    process.env.THEMES_DIR = path.join(process.cwd(), '.tmp-verify', 'php-convert-test');
    await fs.mkdir(themesRoot(), { recursive: true });
    const id = randomUUID();
    try {
      await installThemePackFiles(id, converted.files);
      const rendered = await renderThemePage(id, converted.manifest, 'home', {
        locale: 'en',
        dir: 'ltr',
        site: { name: 'Demo' },
        page: { title: 'Home', content: '<p>Hello</p>', excerpt: null },
        navigation: [{ label: 'About', url: '/en/about' }],
      });
      expect(rendered.html).toContain('Demo');
      expect(rendered.html).toContain('Home');
      expect(rendered.html).toContain('Hello');
      expect(rendered.cssHrefs.length).toBeGreaterThan(0);
    } finally {
      await removeThemeDir(id).catch(() => undefined);
      if (prev === undefined) delete process.env.THEMES_DIR;
      else process.env.THEMES_DIR = prev;
    }
  });

  it('rejects a zip with no PHP', async () => {
    const zip = new JSZip();
    zip.file('readme.txt', 'no php here');
    const buf = Buffer.from(await zip.generateAsync({ type: 'uint8array' }));
    await expect(convertPhpThemeZip(buf)).rejects.toThrow(/No PHP templates/);
  });
});
