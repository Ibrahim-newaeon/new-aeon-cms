// tests/faq-pack-block.test.ts
//
// A `faq` block used to render as nothing on a theme-pack site — it is not one
// of the ten types lib/themes/blocks-to-html.ts handles — so the FAQ page had
// to be hand-written HTML, and a hand-written page carries no FAQPage schema.
// That is the structured data answer engines quote most directly.
//
// A pack can now ship `partials/block-faq.html` and render the block itself.
// These cover the three things that decide whether that is safe: the partial
// wins over the shared rendering, editor text is escaped on the way in, and
// the picker stops calling the type unsupported for a pack that supports it.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import JSZip from 'jszip';
import { extractThemeZip } from '@/lib/themes/zip';
import { renderBlockPartial } from '@/lib/themes/render';
import { blocksToHtml } from '@/lib/themes/blocks-to-html';
import { packSupportedBlocks, unsupportedPackBlocks, PACK_SUPPORTED_BLOCKS } from '@/lib/themes/pack-blocks';
import { faqJsonLd } from '@/lib/seo/json-ld';
import { removeThemeDir, themesRoot } from '@/lib/themes/store';
import type { ContentBlock } from '@/lib/blocks/types';

const PACK_DIR = path.join(process.cwd(), 'themes', 'al-ai');

const FAQ: ContentBlock = {
  type: 'faq',
  items: [
    { question: 'What do you do?', answer: 'AI systems and marketing.' },
    { question: 'Second?', answer: 'Yes.' },
  ],
};

describe('packSupportedBlocks', () => {
  it('is the shared set when a pack ships no block partials', () => {
    expect([...packSupportedBlocks({ header: 'partials/header.html' })].sort()).toEqual(
      [...PACK_SUPPORTED_BLOCKS].sort()
    );
  });

  /** The point: a partial extends what the pack can render. */
  it('adds a type the pack has a block partial for', () => {
    const set = packSupportedBlocks({ 'block-faq': 'partials/block-faq.html' });
    expect(set.has('faq')).toBe(true);
    expect(PACK_SUPPORTED_BLOCKS.has('faq')).toBe(false);
  });

  it('ignores partials that are not block partials', () => {
    expect(packSupportedBlocks({ footer: 'partials/footer.html' }).has('footer' as never)).toBe(false);
  });

  it('handles a pack with no partials at all', () => {
    expect(packSupportedBlocks(undefined).size).toBe(PACK_SUPPORTED_BLOCKS.size);
  });

  /**
   * The picker reads this. Reporting faq as unsupported for a pack that
   * renders it talks an editor out of a working feature — worse than silence.
   */
  it('drops a supported type out of the unsupported list', () => {
    const types = ['faq', 'stats', 'heading'] as ContentBlock['type'][];
    expect(unsupportedPackBlocks(types, { 'block-faq': 'partials/block-faq.html' })).toEqual(['stats']);
    expect(unsupportedPackBlocks(types, {})).toEqual(['faq', 'stats']);
  });
});

describe('the al-ai pack rendering a faq block', () => {
  const ids: string[] = [];
  const prevDir = process.env.THEMES_DIR;
  let id: string;
  let manifest: Awaited<ReturnType<typeof extractThemeZip>>;

  beforeAll(async () => {
    process.env.THEMES_DIR = path.join(process.cwd(), '.tmp-verify', 'themes-faq');
    await fs.mkdir(themesRoot(), { recursive: true });

    const zip = new JSZip();
    zip.file('theme.json', await fs.readFile(path.join(PACK_DIR, 'theme.json')));
    for (const dir of ['templates', 'partials']) {
      for (const name of await fs.readdir(path.join(PACK_DIR, dir))) {
        zip.file(`${dir}/${name}`, await fs.readFile(path.join(PACK_DIR, dir, name)));
      }
    }
    id = randomUUID();
    ids.push(id);
    manifest = await extractThemeZip(id, Buffer.from(await zip.generateAsync({ type: 'uint8array' })));
  });

  afterAll(async () => {
    for (const i of ids) await removeThemeDir(i).catch(() => undefined);
    if (prevDir === undefined) delete process.env.THEMES_DIR;
    else process.env.THEMES_DIR = prevDir;
  });

  it('declares the partial in its manifest', () => {
    expect(manifest.partials['block-faq']).toBe('partials/block-faq.html');
  });

  /** All four class names are what theme.js binds to; renaming any breaks it. */
  it('emits the accordion DOM the theme script drives', async () => {
    const html = await renderBlockPartial(id, manifest, FAQ as never);
    expect(html).toContain('tt-accordion');
    expect(html).toContain('tt-accordion-item');
    expect(html).toContain('tt-accordion-heading');
    expect(html).toContain('tt-accordion-content');
    expect(html).toContain('What do you do?');
    expect(html).toContain('Second?');
  });

  /** An accordion with everything shut reads as broken rather than tidy. */
  it('opens the first item only', async () => {
    const html = (await renderBlockPartial(id, manifest, FAQ as never)) ?? '';
    expect(html.match(/is-open/g)).toHaveLength(1);
  });

  /**
   * liquidjs does NOT escape by default, these fields are editor input, and the
   * result reaches the page through dangerouslySetInnerHTML. Unescaped, an
   * answer containing a tag would be markup rather than text.
   */
  it('escapes editor text', async () => {
    const html = (await renderBlockPartial(id, manifest, {
      type: 'faq',
      items: [{ question: '<img src=x onerror=alert(1)>', answer: 'a & b' }],
    } as never)) ?? '';
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img');
    expect(html).toContain('a &amp; b');
  });

  it('renders nothing for a faq block with no items', async () => {
    const html = (await renderBlockPartial(id, manifest, { type: 'faq', items: [] } as never)) ?? '';
    expect(html.trim()).toBe('');
  });

  it('returns null for a type the pack has no partial for', async () => {
    expect(await renderBlockPartial(id, manifest, { type: 'stats', items: [] } as never)).toBeNull();
  });

  /** The wiring: blocksToHtml prefers the pack's markup over its own. */
  it('lets the partial win inside blocksToHtml', async () => {
    const withPartial = await blocksToHtml([FAQ], 'trusted', (b) =>
      renderBlockPartial(id, manifest, b as never)
    );
    expect(withPartial).toContain('tt-accordion');

    // And without the hook the same block still renders as nothing, which is
    // the behaviour every pack shipping no partial keeps.
    expect(await blocksToHtml([FAQ], 'trusted')).toBe('');
  });

  it('still renders the shared markup for types the pack does not override', async () => {
    const html = await blocksToHtml([{ type: 'heading', level: 2, text: 'Hi' }], 'trusted', (b) =>
      renderBlockPartial(id, manifest, b as never)
    );
    expect(html).toContain('<h2>Hi</h2>');
  });
});

describe('FAQPage schema from the same blocks', () => {
  it('builds one node from the block items', () => {
    const node = faqJsonLd((FAQ as { items: { question: string; answer: string }[] }).items) as {
      '@type': string;
      mainEntity: { name: string; acceptedAnswer: { text: string } }[];
    };
    expect(node['@type']).toBe('FAQPage');
    expect(node.mainEntity).toHaveLength(2);
    expect(node.mainEntity[0]?.name).toBe('What do you do?');
    expect(node.mainEntity[0]?.acceptedAnswer.text).toBe('AI systems and marketing.');
  });

  /** An empty mainEntity is invalid; no node at all is the right answer. */
  it('returns null when nothing is answerable', () => {
    expect(faqJsonLd([{ question: '  ', answer: '' }])).toBeNull();
  });
});
