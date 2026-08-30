// lib/blocks/types.ts
// Canonical ContentBlock union, transcribed from new-aeon-mega-prompt.md
// > CONTENT BLOCKS (Structured Editor).
//
// Blocks are persisted as JSON in `contentI18n.body` (jsonb) — adding a block
// type requires NO database migration. See lib/db/schema.ts.

/** One testimonial entry inside a `testimonial` block. */
export interface TestimonialItem {
  /** The testimonial text itself. Plain text — never rendered as HTML. */
  quote: string;
  /** Person giving the testimonial. */
  author: string;
  /** Job title / company. Optional. */
  role?: string;
  /** Absolute URL or site-relative path (e.g. `/uploads/avatar.jpg`). Optional. */
  avatar?: string;
  /** Whole stars, 1-5. Optional. */
  rating?: number;
}

export interface TestimonialBlock {
  type: 'testimonial';
  items: TestimonialItem[];
  /**
   * ASSUMPTION (beyond mega-prompt spec): grid width control, mirroring the
   * `columns` field that `feature-grid` already carries. Defaults to 3.
   */
  columns?: 1 | 2 | 3;
}

export type ContentBlock =
  | { type: 'heading'; level: 1 | 2 | 3 | 4; text: string; anchor?: string }
  | { type: 'paragraph'; text: string; align?: 'left' | 'center' | 'right' | 'justify' }
  | { type: 'image'; src: string; alt: string; caption?: string; width?: number; height?: number; layout: 'full' | 'wide' | 'normal' }
  | { type: 'gallery'; images: { src: string; alt: string }[]; layout: 'grid' | 'masonry' | 'carousel' | 'slideshow' }
  | { type: 'video'; url: string; provider: 'youtube' | 'vimeo' | 'self'; poster?: string; autoplay?: boolean }
  | { type: 'quote'; text: string; author?: string; source?: string; style: 'bordered' | 'pull' }
  | { type: 'embed'; url: string; provider: 'instagram' | 'twitter' | 'tiktok' | 'facebook' }
  | { type: 'button'; text: string; url: string; variant: 'primary' | 'secondary' | 'outline' | 'ghost'; size: 'sm' | 'md' | 'lg'; fullWidth?: boolean }
  | { type: 'divider'; style: 'line' | 'space' | 'dots' | 'stars' }
  | { type: 'spacer'; height: number }
  | { type: 'html'; content: string }
  /**
   * Prose. The TipTap document is stored VERBATIM and treated as opaque —
   * we never walk its internals. Rendering goes through TipTap's own
   * generateHTML(), then through the sanitizer.
   *
   * This is why `body` is ContentBlock[] and NOT a TipTap doc: TipTap emits
   * prose nodes ({type:'paragraph', content:[{type:'text'}]}), while this
   * union describes layout sections. They collide on `type` names but have
   * different shapes, so one array cannot be both.
   */
  | { type: 'rich-text'; content: Record<string, unknown> }
  | { type: 'table'; rows: number; cols: number; data: string[][]; headerRow?: boolean }
  /**
   * Rotating hero slider. Independent of commerce: a slide is an image plus
   * optional words and one link, so it works on a content home page and on a
   * shop home page, and a slide can point at a product URL without this block
   * knowing what a product is.
   */
  | {
      type: 'slider';
      /**
       * Which placement's rules apply. See SLIDER_LIMITS in lib/blocks/slider:
       * `main` is the home hero (image or video, up to 5), `inner` is for
       * ordinary pages (images only, up to 2).
       */
      variant: 'main' | 'inner';
      slides: {
        /**
         * Chosen before anything is uploaded, because it decides what the
         * editor asks for: an image, a video file, or a YouTube link.
         */
        kind: 'image' | 'video' | 'youtube';
        /** Image URL, an uploaded video URL, or a YouTube link. */
        src: string;
        /** Still shown before a video paints, and instead of it when the
         *  visitor has asked for reduced motion. */
        poster?: string;
        alt?: string;
        /** Small label above the heading. */
        eyebrow?: string;
        title?: string;
        text?: string;
        buttonText?: string;
        buttonUrl?: string;
      }[];
      autoplay: boolean;
      /** Milliseconds per slide. Clamped by the editor and the component. */
      intervalMs: number;
      height: 'short' | 'medium' | 'tall';
    }
  /**
   * A list of files a reader can download — the point of a Resources page.
   * `url` points at /api/media/{id}/download so the browser saves the file
   * instead of opening a PDF in its viewer.
   */
  | {
      type: 'downloads';
      items: {
        title: string;
        url: string;
        /** Shown next to the title, e.g. "PDF · 2.4 MB". Set by the editor. */
        meta?: string;
      }[];
    }
  | { type: 'accordion'; items: { title: string; content: ContentBlock[] }[] }
  | { type: 'tabs'; items: { label: string; content: ContentBlock[] }[] }
  | { type: 'cta'; title: string; text: string; button: { text: string; url: string }; backgroundImage?: string; overlay?: boolean }
  | { type: 'feature-grid'; items: { icon?: string; title: string; description: string }[]; columns: 2 | 3 | 4 }
  | TestimonialBlock
  | { type: 'team'; members: { name: string; role: string; bio?: string; photo?: string; social?: Record<string, string> }[] }
  | { type: 'stats'; items: { value: string; label: string; prefix?: string; suffix?: string }[] }
  | { type: 'timeline'; items: { date: string; title: string; description: string; icon?: string }[] }
  | { type: 'comparison'; items: { feature: string; values: Record<string, string | boolean> }[]; columns: string[] }
  | { type: 'pricing'; plans: { name: string; price: string; period?: string; features: string[]; cta: { text: string; url: string }; highlighted?: boolean }[] }
  | { type: 'map'; location: { lat: number; lng: number }; zoom?: number; marker?: string }
  | { type: 'contact-form'; fields: ('name' | 'email' | 'phone' | 'message' | 'subject')[]; submitLabel?: string; successMessage?: string }
  | { type: 'newsletter'; title: string; description?: string; buttonText?: string; privacyNote?: string }
  | { type: 'social-links'; platforms: ('facebook' | 'instagram' | 'twitter' | 'linkedin' | 'youtube' | 'tiktok')[]; style: 'icons' | 'buttons' | 'floating' }
  | { type: 'recent-posts'; title: string; category?: string; count: number; layout: 'list' | 'grid' | 'carousel' }
  | { type: 'product-grid'; productIds: string[]; layout: 'grid' | 'list' | 'carousel' }
  | { type: 'custom'; component: string; props: Record<string, unknown> };

/** Narrowing helper so BlockRenderer stays free of `any` casts. */
export function isTestimonialBlock(block: ContentBlock): block is TestimonialBlock {
  return block.type === 'testimonial';
}
