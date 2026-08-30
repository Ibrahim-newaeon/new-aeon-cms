// lib/blocks/defaults.ts
import type { ContentBlock } from './types';
import type { MessageKey } from '@/lib/admin-i18n/messages';

export type BlockType = ContentBlock['type'];

/**
 * Message keys for the block picker labels, resolved through the admin
 * dictionary so they follow the admin UI locale. Keyed by BlockType rather
 * than `string`, so adding a variant to the union without a label is a compile
 * error instead of a block that shows its raw slug in the UI; typing the values
 * as MessageKey means a key with no dictionary entry fails to compile too.
 */
export const BLOCK_LABEL_KEYS: Record<BlockType, MessageKey> = {
  'rich-text': 'block.rich-text',
  heading: 'block.heading',
  paragraph: 'block.paragraph',
  image: 'block.image',
  gallery: 'block.gallery',
  slider: 'block.slider',
  video: 'block.video',
  quote: 'block.quote',
  embed: 'block.embed',
  button: 'block.button',
  divider: 'block.divider',
  spacer: 'block.spacer',
  html: 'block.html',
  table: 'block.table',
  accordion: 'block.accordion',
  tabs: 'block.tabs',
  cta: 'block.cta',
  'feature-grid': 'block.feature-grid',
  testimonial: 'block.testimonial',
  team: 'block.team',
  stats: 'block.stats',
  timeline: 'block.timeline',
  comparison: 'block.comparison',
  pricing: 'block.pricing',
  map: 'block.map',
  'contact-form': 'block.contact-form',
  newsletter: 'block.newsletter',
  'social-links': 'block.social-links',
  'recent-posts': 'block.recent-posts',
  'product-grid': 'block.product-grid',
  custom: 'block.custom',
};

/**
 * Which blocks have a real editor. The picker badges the rest as "Soon".
 *
 * Every block type currently has one, so the badge renders nowhere. The set
 * stays because it is the seam a block type added without an editor must pass
 * through, and tests/block-editors-coverage.test.ts fails if one appears.
 *
 * This set is hand-maintained and drifted badly: table, pricing, comparison,
 * product-grid and custom were badged "Soon" while their editors worked, and
 * so were accordion and tabs — those two dispatch from BlockBuilder rather
 * than BlockEditor, which made them easy to read as unbuilt. The test now
 * parses BOTH dispatch sites rather than trusting a hand-written list, because
 * a hand-written list is exactly what failed here.
 */
export const EDITABLE_BLOCKS: ReadonlySet<BlockType> = new Set<BlockType>([
  'rich-text', 'heading', 'paragraph', 'image', 'quote', 'button', 'divider',
  'spacer', 'html', 'testimonial', 'cta', 'feature-grid', 'stats', 'gallery',
  'video', 'embed', 'team', 'timeline', 'social-links', 'recent-posts', 'map',
  'newsletter', 'contact-form', 'table', 'pricing', 'comparison',
  'product-grid', 'custom', 'accordion', 'tabs', 'slider',
]);

/**
 * Typed factory. The previous version ended in
 * `return { type: type as any, text: '' }`, which produced structurally invalid
 * blocks for ~20 of the types — e.g. an `image` with no src/alt/layout.
 */
const FACTORIES: { [K in BlockType]: () => Extract<ContentBlock, { type: K }> } = {
  'rich-text': () => ({
    type: 'rich-text',
    content: { type: 'doc', content: [{ type: 'paragraph' }] },
  }),
  heading: () => ({ type: 'heading', level: 2, text: '' }),
  paragraph: () => ({ type: 'paragraph', text: '' }),
  image: () => ({ type: 'image', src: '', alt: '', layout: 'normal' }),
  slider: () => ({
    type: 'slider',
    variant: 'main',
    slides: [],
    autoplay: true,
    intervalMs: 6000,
    height: 'medium',
  }),
  gallery: () => ({ type: 'gallery', images: [], layout: 'grid' }),
  video: () => ({ type: 'video', url: '', provider: 'youtube' }),
  quote: () => ({ type: 'quote', text: '', style: 'bordered' }),
  embed: () => ({ type: 'embed', url: '', provider: 'instagram' }),
  button: () => ({ type: 'button', text: '', url: '', variant: 'primary', size: 'md' }),
  divider: () => ({ type: 'divider', style: 'line' }),
  spacer: () => ({ type: 'spacer', height: 2 }),
  html: () => ({ type: 'html', content: '' }),
  table: () => ({ type: 'table', rows: 2, cols: 2, data: [['', ''], ['', '']], headerRow: true }),
  accordion: () => ({ type: 'accordion', items: [] }),
  tabs: () => ({ type: 'tabs', items: [] }),
  cta: () => ({ type: 'cta', title: '', text: '', button: { text: '', url: '' } }),
  'feature-grid': () => ({ type: 'feature-grid', items: [], columns: 3 }),
  testimonial: () => ({ type: 'testimonial', items: [{ quote: '', author: '' }], columns: 3 }),
  team: () => ({ type: 'team', members: [] }),
  stats: () => ({ type: 'stats', items: [] }),
  timeline: () => ({ type: 'timeline', items: [] }),
  comparison: () => ({ type: 'comparison', items: [], columns: [] }),
  pricing: () => ({ type: 'pricing', plans: [] }),
  map: () => ({ type: 'map', location: { lat: 0, lng: 0 }, zoom: 12 }),
  'contact-form': () => ({ type: 'contact-form', fields: ['name', 'email', 'message'] }),
  newsletter: () => ({ type: 'newsletter', title: '' }),
  'social-links': () => ({ type: 'social-links', platforms: [], style: 'icons' }),
  'recent-posts': () => ({ type: 'recent-posts', title: '', count: 3, layout: 'grid' }),
  'product-grid': () => ({ type: 'product-grid', productIds: [], layout: 'grid' }),
  custom: () => ({ type: 'custom', component: '', props: {} }),
};

export function createDefaultBlock(type: BlockType): ContentBlock {
  return FACTORIES[type]();
}

export const ALL_BLOCK_TYPES = Object.keys(BLOCK_LABEL_KEYS) as BlockType[];

/**
 * Rejects javascript:, data: and other script-bearing schemes before a URL
 * reaches an href. The renderer sanitizes too, but blocking at input time
 * means bad values never get stored.
 */
export function isSafeUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) return true;
  try {
    const url = new URL(trimmed);
    return ['http:', 'https:', 'mailto:', 'tel:'].includes(url.protocol);
  } catch {
    return false;
  }
}
