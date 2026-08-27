// lib/blocks/defaults.ts
import type { ContentBlock } from './types';

export type BlockType = ContentBlock['type'];

/**
 * Arabic labels for the block picker. Keyed by BlockType rather than `string`,
 * so adding a variant to the union without a label is a compile error instead
 * of a block that shows its raw slug in the UI.
 */
export const BLOCK_LABELS: Record<BlockType, string> = {
  'rich-text': 'نص منسق',
  heading: 'عنوان',
  paragraph: 'فقرة',
  image: 'صورة',
  gallery: 'معرض صور',
  video: 'فيديو',
  quote: 'اقتباس',
  embed: 'تضمين',
  button: 'زر',
  divider: 'فاصل',
  spacer: 'مسافة',
  html: 'HTML',
  table: 'جدول',
  accordion: 'أكورديون',
  tabs: 'تبويبات',
  cta: 'دعوة للإجراء',
  'feature-grid': 'شبكة مميزات',
  testimonial: 'آراء العملاء',
  team: 'الفريق',
  stats: 'إحصائيات',
  timeline: 'خط زمني',
  comparison: 'مقارنة',
  pricing: 'الأسعار',
  map: 'خريطة',
  'contact-form': 'نموذج اتصال',
  newsletter: 'نشرة بريدية',
  'social-links': 'روابط اجتماعية',
  'recent-posts': 'منشورات حديثة',
  'product-grid': 'منتجات',
  custom: 'مكوّن مخصص',
};

/** Which blocks currently have a real editor. The rest are addable but stubbed. */
export const EDITABLE_BLOCKS: ReadonlySet<BlockType> = new Set<BlockType>([
  'rich-text', 'heading', 'paragraph', 'image', 'quote', 'button', 'divider',
  'spacer', 'html', 'testimonial', 'cta', 'feature-grid', 'stats', 'gallery',
  'video', 'embed', 'team', 'timeline', 'social-links', 'recent-posts', 'map',
  'newsletter', 'contact-form',
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

export const ALL_BLOCK_TYPES = Object.keys(BLOCK_LABELS) as BlockType[];

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
