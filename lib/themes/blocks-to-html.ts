// lib/themes/blocks-to-html.ts
// Lightweight block → HTML for Liquid page.content (no React).

import { generateHTML } from '@tiptap/html';
import StarterKit from '@tiptap/starter-kit';
import TiptapImage from '@tiptap/extension-image';
import TiptapLink from '@tiptap/extension-link';
import type { ContentBlock } from '@/lib/blocks/types';
import { processHtmlPaste } from '@/lib/blocks/html-paste';
import { sanitizeRichHtml, type HtmlPasteMode } from '@/lib/blocks/sanitize';

const tiptapExtensions = [StarterKit, TiptapImage, TiptapLink];

function escapeText(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function blocksToHtml(
  blocks: ContentBlock[] | null | undefined,
  pasteMode: HtmlPasteMode = 'safe'
): string {
  if (!blocks?.length) return '';
  return blocks.map((b) => blockToHtml(b, pasteMode)).filter(Boolean).join('\n');
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
