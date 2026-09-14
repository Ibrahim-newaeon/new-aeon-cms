// lib/themes/blocks-to-html.ts
// Lightweight block → HTML for Liquid page.content (no React).

import { generateHTML } from '@tiptap/html';
import StarterKit from '@tiptap/starter-kit';
import TiptapImage from '@tiptap/extension-image';
import TiptapLink from '@tiptap/extension-link';
import type { ContentBlock } from '@/lib/blocks/types';
import { processHtmlPaste } from '@/lib/blocks/html-paste';
import { sanitizeRichHtml, type HtmlPasteMode } from '@/lib/blocks/sanitize';

// Re-exported so the list stays reachable from beside the switch it describes,
// while the definition lives in a module a Client Component can import.
export { PACK_SUPPORTED_BLOCKS } from './pack-blocks';

const tiptapExtensions = [StarterKit, TiptapImage, TiptapLink];

function escapeText(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * A pack's own rendering for one block, or null when it ships none.
 *
 * Supplied by lib/themes/present.ts, which is the only caller that knows which
 * theme is active. Kept as a parameter rather than an import so this module
 * stays free of theme lookup and remains unit-testable without a theme on disk.
 */
export type BlockPartialRenderer = (block: ContentBlock) => Promise<string | null>;

export async function blocksToHtml(
  blocks: ContentBlock[] | null | undefined,
  pasteMode: HtmlPasteMode = 'safe',
  renderPartial?: BlockPartialRenderer
): Promise<string> {
  if (!blocks?.length) return '';

  const out: string[] = [];
  for (const block of blocks) {
    /*
     * The pack's own markup wins when it has some — including for the 23 types
     * the switch below drops. That is the whole point: a pack shipping
     * partials/block-faq.html makes `faq` work for that pack, with its classes
     * and its JS hooks, rather than rendering as nothing.
     */
    if (renderPartial) {
      const custom = await renderPartial(block);
      if (custom !== null) {
        if (custom.trim()) out.push(custom);
        continue;
      }
    }
    const generic = blockToHtml(block, pasteMode);
    if (generic) out.push(generic);
  }
  return out.join('\n');
}

function blockToHtml(block: ContentBlock, pasteMode: HtmlPasteMode): string {
  switch (block.type) {
    case 'heading': {
      const tag = `h${block.level}` as const;
      const id = block.anchor ? ` id="${escapeText(block.anchor)}"` : '';
      return `<${tag}${id}>${escapeText(block.text)}</${tag}>`;
    }
    case 'paragraph': {
      const align = block.align ? ` style="text-align:${block.align}"` : '';
      return `<p${align}>${escapeText(block.text)}</p>`;
    }
    case 'image':
      return `<figure><img src="${escapeText(block.src)}" alt="${escapeText(block.alt)}" />${
        block.caption ? `<figcaption>${escapeText(block.caption)}</figcaption>` : ''
      }</figure>`;
    case 'html': {
      const scoped = processHtmlPaste(block.content, {
        mode: pasteMode,
        isolate: block.isolate !== false,
      });
      const cls = scoped.scopeClass ? ` class="${scoped.scopeClass}"` : '';
      const style = scoped.css ? `<style>${scoped.css}</style>` : '';
      return `<div${cls} data-html-block>${style}${scoped.html}</div>`;
    }
    case 'rich-text': {
      try {
        const html = generateHTML(block.content, tiptapExtensions);
        return `<div class="prose">${sanitizeRichHtml(html)}</div>`;
      } catch {
        return '';
      }
    }
    case 'button':
      return `<p><a class="btn btn-${escapeText(block.variant)}" href="${escapeText(block.url)}">${escapeText(block.text)}</a></p>`;
    case 'divider':
      return block.style === 'space' ? '<div style="height:2rem"></div>' : '<hr />';
    case 'spacer':
      return `<div style="height:${Math.min(Math.max(block.height, 0), 24)}rem"></div>`;
    case 'quote':
      return `<blockquote><p>${escapeText(block.text)}</p>${
        block.author ? `<cite>${escapeText(block.author)}</cite>` : ''
      }</blockquote>`;
    case 'cta':
      return `<section class="cta"><h2>${escapeText(block.title)}</h2><p>${escapeText(block.text)}</p>${
        block.button?.url
          ? `<p><a href="${escapeText(block.button.url)}">${escapeText(block.button.text)}</a></p>`
          : ''
      }</section>`;
    default:
      // Complex interactive blocks stay on builtin React pages; themes get a
      // quiet skip rather than a broken widget.
      return '';
  }
}
