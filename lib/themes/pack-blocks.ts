// lib/themes/pack-blocks.ts
//
// Which block types a theme pack actually renders.
//
// Its own module, and deliberately dependency-free. The list belongs beside
// the switch in blocks-to-html.ts that implements it, but that module reaches
// node:crypto through lib/blocks/html-paste, and the admin block picker is a
// Client Component — importing it there broke the build with
// "Reading from node:crypto is not handled by plugins". A bare constant can be
// imported from either side.
//
// tests/pack-block-support.test.ts checks this against blocks-to-html.ts's
// switch, so the two cannot drift.

import type { ContentBlock } from '@/lib/blocks/types';

/**
 * The types blocksToHtml() emits markup for. Everything else hits its default
 * arm and returns an empty string — right at render time, since a half-built
 * widget inside a customer's theme is worse than nothing, but invisible to the
 * person authoring the page. On a theme-pack site an editor could add a Stats
 * block, fill it in, save, and find nothing on the page and no error anywhere.
 *
 * The admin block picker reads this to badge the rest.
 */
export const PACK_SUPPORTED_BLOCKS: ReadonlySet<ContentBlock['type']> = new Set([
  'heading', 'paragraph', 'image', 'html', 'rich-text',
  'button', 'divider', 'spacer', 'quote', 'cta',
] as const);
