// lib/themes/php-convert.ts
// Convert-only PHP theme importer. Never executes PHP — rewrites common
// WordPress / generic PHP theme patterns into an HTML theme pack (Liquid).

import JSZip from 'jszip';
import path from 'node:path';
import {
  MAX_THEME_FILES,
  MAX_THEME_FILE_BYTES,
  MAX_THEME_UNCOMPRESSED_BYTES,
  MAX_THEME_ZIP_BYTES,
  THEME_ALLOWED_EXTENSIONS,
} from './limits';
import type { ThemeManifest } from './package';
import { ThemeZipError } from './zip';

const PHP_INPUT_EXTENSIONS = new Set([
  ...THEME_ALLOWED_EXTENSIONS,
  '.php',
  '.phtml',
  '.inc',
]);

export type ConvertedThemePack = {
  manifest: ThemeManifest;
  files: Map<string, Buffer>;
  warnings: string[];
};

function extOf(name: string): string {
  const base = name.split('/').pop() ?? name;
  const i = base.lastIndexOf('.');
  return i >= 0 ? base.slice(i).toLowerCase() : '';
}

function normalizeEntryName(name: string): string | null {
  const cleaned = name.replace(/\\/g, '/').replace(/^\/+/, '');
  if (!cleaned || cleaned.endsWith('/')) return null;
  if (cleaned.includes('..')) return null;
  if (cleaned.startsWith('__MACOSX/')) return null;
  if (path.isAbsolute(cleaned)) return null;
  return cleaned;
}

function stripZipPrefix(entries: { name: string; data: Buffer }[]): { name: string; data: Buffer }[] {
  // If everything lives under one top folder, strip it.
  const tops = new Set(
    entries.map((e) => e.name.split('/')[0]).filter(Boolean) as string[]
  );
  if (tops.size !== 1) return entries;
  const top = [...tops][0]!;
  const hasNested = entries.some((e) => e.name.includes('/'));
  if (!hasNested) return entries;
  // Only strip if theme-like files sit under that folder.
  const under = entries.filter((e) => e.name.startsWith(top + '/'));
  if (under.length !== entries.length) return entries;
  return under.map((e) => ({ name: e.name.slice(top.length + 1), data: e.data }));
}

/**
 * Map WordPress / common PHP theme filenames → pack paths.
 * Returns null for files that should be skipped (functions.php, etc.).
 */
export function mapPhpThemePath(rel: string): string | null {
  const lower = rel.toLowerCase();
  const base = lower.split('/').pop() ?? lower;

  // Skip PHP that is logic-only — cannot convert safely.
  if (
    base === 'functions.php' ||
    base === 'functions.inc' ||
    base.startsWith('class-') ||
    lower === 'inc' ||
    lower.startsWith('inc/') ||
    lower.includes('/inc/') ||
    lower.startsWith('includes/') ||
    lower.includes('/includes/') ||
    lower.startsWith('vendor/') ||
    lower.includes('/vendor/')
  ) {
    return null;
  }

  const map: Record<string, string> = {
    'header.php': 'partials/header.html',
    'footer.php': 'partials/footer.html',
    'sidebar.php': 'partials/sidebar.html',
    'index.php': 'templates/home.html',
    'front-page.php': 'templates/home.html',
    'home.php': 'templates/home.html',
    'page.php': 'templates/page.html',
    'single.php': 'templates/post.html',
    'single-post.php': 'templates/post.html',
    'archive.php': 'templates/blog.html',
    'home-blog.php': 'templates/blog.html',
    'style.css': 'assets/style.css',
  };

  if (map[base]) return map[base]!;

  // Nested template-parts
  if (lower.includes('template-parts/') || lower.includes('partials/') || lower.includes('parts/')) {
    const name = base.replace(/\.php$/, '.html');
    return `partials/${name}`;
  }

  // Static assets keep relative path under assets/
  const ext = extOf(base);
  if (['.css', '.js', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.woff', '.woff2', '.ttf'].includes(ext)) {
    // Prefer style.css at root → assets/; otherwise nest under assets/
    if (base === 'style.css') return 'assets/style.css';
    return `assets/${rel.replace(/^\/+/, '')}`.replace(/\/+/g, '/');
  }

  // Other .php → templates/ with html extension if top-level-ish
  if (ext === '.php' || ext === '.phtml') {
    const name = base.replace(/\.php$|\.phtml$/i, '.html');
    return `templates/${name}`;
  }

  return null;
}

/**
 * Rewrite PHP template source to Liquid HTML. Does not execute PHP.
 */
export function convertPhpSource(source: string): { html: string; warnings: string[] } {
  const warnings: string[] = [];
  let html = source;

  // Normalize short open tags rare cases later; focus on common WP tags.
  const replacements: [RegExp, string, string?][] = [
    [/<\?php\s+get_header\s*\(\s*(?:['"][^'"]*['"]\s*)?\)\s*;?\s*\?>/gi, `{% render 'partials/header.html' %}`],
    [/<\?php\s+get_footer\s*\(\s*(?:['"][^'"]*['"]\s*)?\)\s*;?\s*\?>/gi, `{% render 'partials/footer.html' %}`],
    [/<\?php\s+get_sidebar\s*\(\s*(?:['"][^'"]*['"]\s*)?\)\s*;?\s*\?>/gi, `{% render 'partials/sidebar.html' %}`],
    [/<\?php\s+the_title\s*\([^)]*\)\s*;?\s*\?>/gi, `{{ page.title }}`],
    [/<\?=\s*the_title\s*\([^)]*\)\s*;?\s*\?>/gi, `{{ page.title }}`],
    [/<\?php\s+the_content\s*\([^)]*\)\s*;?\s*\?>/gi, `{{ page.content }}`],
    [/<\?php\s+the_excerpt\s*\([^)]*\)\s*;?\s*\?>/gi, `{{ page.excerpt }}`],
    [/<\?php\s+bloginfo\s*\(\s*['"]name['"]\s*\)\s*;?\s*\?>/gi, `{{ site.name }}`],
    [/<\?php\s+bloginfo\s*\(\s*['"]description['"]\s*\)\s*;?\s*\?>/gi, `{{ site.description }}`],
    [/<\?\s*=\s*get_bloginfo\s*\(\s*['"]name['"]\s*\)\s*;?\s*\?>/gi, `{{ site.name }}`],
    [/<\?php\s+language_attributes\s*\(\s*\)\s*;?\s*\?>/gi, `lang="{{ locale }}"`],
    [/<\?php\s+body_class\s*\([^)]*\)\s*;?\s*\?>/gi, `class="theme-body"`],
    // Escape helpers that wrap text — drop PHP, keep structure
    [/<\?php\s+esc_html\s*\(\s*get_bloginfo\s*\(\s*['"]name['"]\s*\)\s*\)\s*;?\s*\?>/gi, `{{ site.name }}`],
    [/<\?php\s+esc_url\s*\(\s*home_url\s*\(\s*(?:['"]\/['"])?\s*\)\s*\)\s*;?\s*\?>/gi, `/{{ locale }}`],
  ];

  for (const [re, to] of replacements) {
    html = html.replace(re, to);
  }

  // wp_nav_menu(...) → simple navigation loop
  if (/wp_nav_menu\s*\(/i.test(html)) {
    html = html.replace(
      /<\?php\s+wp_nav_menu\s*\([^;]*\)\s*;?\s*\?>/gi,
      `{% for item in navigation %}<a href="{{ item.url }}">{{ item.label }}</a>{% endfor %}`
    );
  }

  // have_posts / the_post loops → posts list (blog)
  if (/have_posts\s*\(/i.test(html) && /the_post\s*\(/i.test(html)) {
    warnings.push('Converted a WordPress loop into a Liquid posts list — review blog template.');
    // Replace the common while loop block coarsely
    html = html.replace(
      /<\?php\s+if\s*\(\s*have_posts\s*\(\s*\)\s*\)\s*:\s*\?>[\s\S]*?<\?php\s+endif\s*;?\s*\?>/gi,
      `<ul class="converted-posts">
{% for post in posts %}
  <li><a href="{{ post.url }}">{{ post.title }}</a>{% if post.excerpt %}<p>{{ post.excerpt }}</p>{% endif %}</li>
{% endfor %}
</ul>`
    );
  }

  // stylesheet / template URI → asset filter hints
  html = html.replace(
    /<\?php\s+echo\s+get_stylesheet_uri\s*\(\s*\)\s*;?\s*\?>/gi,
    `{{ 'assets/style.css' | asset }}`
  );
  html = html.replace(
    /<\?php\s+bloginfo\s*\(\s*['"]stylesheet_url['"]\s*\)\s*;?\s*\?>/gi,
    `{{ 'assets/style.css' | asset }}`
  );
  html = html.replace(
    /get_template_directory_uri\s*\(\s*\)/gi,
    `'' /* converted: use | asset */`
  );

  // Count leftover PHP
  const leftover = html.match(/<\?(?:php|=)?[\s\S]*?\?>/gi) ?? [];
  if (leftover.length > 0) {
    warnings.push(`Stripped ${leftover.length} remaining PHP block(s) that could not be mapped.`);
    html = html.replace(/<\?(?:php|=)?[\s\S]*?\?>/gi, (block) => {
      const preview = block.replace(/\s+/g, ' ').slice(0, 80);
      return `<!-- unconverted-php: ${preview.replace(/--/g, '—')} -->`;
    });
  }

  // Remove PHP-only open/close without short content already handled
  html = html.replace(/<\?php[\s\S]*?\?>/gi, '');

  return { html, warnings };
}

function detectThemeName(entries: { name: string; data: Buffer }[]): string {
  const style = entries.find((e) => (e.name.split('/').pop() ?? '').toLowerCase() === 'style.css');
  if (style) {
    const text = style.data.toString('utf8').slice(0, 4000);
    const m = text.match(/Theme Name:\s*(.+)/i);
    if (m?.[1]?.trim()) return m[1].trim().slice(0, 100);
  }
  return 'Converted PHP Theme';
}

function ensureLayout(files: Map<string, Buffer>): void {
  if (files.has('templates/layout.html')) return;
  const hasHeader = files.has('partials/header.html');
  const hasFooter = files.has('partials/footer.html');
  const layout = `${hasHeader ? `{% render 'partials/header.html' %}\n` : ''}<main class="converted-main">
{{ content }}
</main>
${hasFooter ? `{% render 'partials/footer.html' %}\n` : ''}`;
  files.set('templates/layout.html', Buffer.from(layout, 'utf8'));
}

function ensureTemplateFallbacks(files: Map<string, Buffer>): void {
  const pageFallback = Buffer.from(
    `<article>
  <h1>{{ page.title }}</h1>
  {% if page.excerpt %}<p>{{ page.excerpt }}</p>{% endif %}
  <div class="content">{{ page.content }}</div>
</article>
`,
    'utf8'
  );
  if (!files.has('templates/page.html')) files.set('templates/page.html', pageFallback);
  if (!files.has('templates/home.html')) {
    files.set(
      'templates/home.html',
      Buffer.from(
        `<section>
  <h1>{{ page.title }}</h1>
  {% if page.excerpt %}<p>{{ page.excerpt }}</p>{% endif %}
  <div class="content">{{ page.content }}</div>
</section>
`,
        'utf8'
      )
    );
  }
  if (!files.has('templates/post.html')) files.set('templates/post.html', pageFallback);
  if (!files.has('templates/blog.html')) {
    files.set(
      'templates/blog.html',
      Buffer.from(
        `<section>
  <h1>{{ page.title }}</h1>
  <ul>
  {% for post in posts %}
    <li><a href="{{ post.url }}">{{ post.title }}</a></li>
  {% endfor %}
  </ul>
</section>
`,
        'utf8'
      )
    );
  }
}

/**
 * Convert a PHP theme zip into an in-memory HTML theme pack.
 */
export async function convertPhpThemeZip(zipBuffer: Buffer): Promise<ConvertedThemePack> {
  if (zipBuffer.byteLength > MAX_THEME_ZIP_BYTES) {
    throw new ThemeZipError(`Zip exceeds ${MAX_THEME_ZIP_BYTES} bytes`);
  }

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(zipBuffer);
  } catch {
    throw new ThemeZipError('Invalid zip archive');
  }

  let entries: { name: string; data: Buffer }[] = [];
  let total = 0;
  let count = 0;

  for (const raw of Object.keys(zip.files)) {
    const file = zip.files[raw];
    if (!file || file.dir) continue;
    const name = normalizeEntryName(raw);
    if (!name) continue;

    count++;
    if (count > MAX_THEME_FILES) throw new ThemeZipError(`Zip has more than ${MAX_THEME_FILES} files`);

    const ext = extOf(name);
    if (!PHP_INPUT_EXTENSIONS.has(ext) && name.toLowerCase() !== 'style.css') {
      // allow style.css even if somehow odd; otherwise skip unknown binaries? reject for safety
      if (!['.map', '.md', '.txt', '.json'].includes(ext)) {
        throw new ThemeZipError(`Disallowed file type in PHP theme: ${name}`);
      }
    }

    const data = Buffer.from(await file.async('uint8array'));
    if (data.byteLength > MAX_THEME_FILE_BYTES) {
      throw new ThemeZipError(`File too large: ${name}`);
    }
    total += data.byteLength;
    if (total > MAX_THEME_UNCOMPRESSED_BYTES) {
      throw new ThemeZipError('Uncompressed theme exceeds size limit');
    }
    entries.push({ name, data });
  }

  entries = stripZipPrefix(entries);

  const hasPhp = entries.some((e) => ['.php', '.phtml', '.inc'].includes(extOf(e.name)));
  if (!hasPhp) {
    throw new ThemeZipError('No PHP templates found — use the HTML theme upload for HTML packs');
  }

  const warnings: string[] = [];
  const files = new Map<string, Buffer>();
  let skipped = 0;

  for (const entry of entries) {
    const dest = mapPhpThemePath(entry.name);
    if (!dest) {
      skipped++;
      continue;
    }

    const ext = extOf(entry.name);
    if (ext === '.php' || ext === '.phtml' || ext === '.inc') {
      let { html, warnings: w } = convertPhpSource(entry.data.toString('utf8'));
      warnings.push(...w.map((msg) => `${entry.name}: ${msg}`));
      // Layout owns chrome — strip header/footer includes from page templates
      // so activating the pack does not double-render nav.
      if (dest.startsWith('templates/')) {
        html = html
          .replace(/\{%\s*render\s+['"]partials\/header\.html['"]\s*%\}/g, '')
          .replace(/\{%\s*render\s+['"]partials\/footer\.html['"]\s*%\}/g, '')
          .replace(/\{%\s*render\s+['"]partials\/sidebar\.html['"]\s*%\}/g, '');
      }
      files.set(dest, Buffer.from(html, 'utf8'));
    } else {
      // Don't overwrite a converted template with a duplicate path from assets
      if (!files.has(dest)) files.set(dest, entry.data);
    }
  }

  if (skipped > 0) {
    warnings.push(`Skipped ${skipped} logic-only PHP file(s) (functions.php, includes, classes).`);
  }

  ensureLayout(files);
  ensureTemplateFallbacks(files);

  const name = detectThemeName(entries);
  const manifest: ThemeManifest = {
    name,
    version: '1.0.0-converted',
    description: 'Converted from a PHP theme (not executed). Review templates before going live.',
    templates: {
      layout: 'templates/layout.html',
      home: 'templates/home.html',
      page: 'templates/page.html',
      post: 'templates/post.html',
      blog: 'templates/blog.html',
    },
    partials: Object.fromEntries(
      [...files.keys()]
        .filter((k) => k.startsWith('partials/'))
        .map((k) => [k.replace(/^partials\//, '').replace(/\.html$/, ''), k])
    ),
  };

  files.set('theme.json', Buffer.from(JSON.stringify(manifest, null, 2), 'utf8'));

  // Require at least one converted template beyond layout
  if (![...files.keys()].some((k) => k.startsWith('templates/') && k !== 'templates/layout.html')) {
    throw new ThemeZipError('Conversion produced no page templates');
  }

  return { manifest, files, warnings: [...new Set(warnings)] };
}
