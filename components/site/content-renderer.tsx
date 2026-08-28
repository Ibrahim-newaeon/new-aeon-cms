// components/site/content-renderer.tsx
// Server Component. Renders the canonical ContentBlock[] stored in
// contentI18n.body. See lib/blocks/types.ts for why body is an array of our
// blocks rather than a TipTap document.
import Image from 'next/image';
import { generateHTML } from '@tiptap/html';
import StarterKit from '@tiptap/starter-kit';
import TiptapImage from '@tiptap/extension-image';
import TiptapLink from '@tiptap/extension-link';
import { cn } from '@/lib/utils'; // was used but never imported — build failure
import { sanitizeRichHtml } from '@/lib/blocks/sanitize';
import { TestimonialBlock } from '@/components/site/blocks/testimonial';
import {
  VideoBlock, EmbedBlock, TeamBlock, TimelineBlock, PricingBlock,
  ComparisonBlock, MapBlock, SocialLinksBlock, RecentPostsBlock,
} from '@/components/site/blocks/extra-blocks';
import { ContactFormBlock, NewsletterBlock } from '@/components/site/blocks/form-blocks';
import { ProductGridBlock } from '@/components/site/blocks/product-grid';
import { resolveCustomBlock } from '@/lib/blocks/custom-registry';
import type { ContentBlock } from '@/lib/blocks/types';

const tiptapExtensions = [StarterKit, TiptapImage, TiptapLink];

interface ContentRendererProps {
  blocks: ContentBlock[] | null | undefined;
  /** Needed by blocks that query content themselves (recent-posts). */
  locale?: 'ar' | 'en';
}

export function ContentRenderer({ blocks, locale = 'ar' }: ContentRendererProps) {
  if (!blocks || !Array.isArray(blocks)) return null;

  return (
    <div className="space-y-6" data-test-id="content-renderer">
      {blocks.map((block, idx) => (
        <BlockRenderer key={idx} block={block} locale={locale} />
      ))}
    </div>
  );
}

// A lookup, not a template literal cast: `h${level}` as
// keyof JSX.IntrinsicElements type-checks but silently permits h5/h6/h0.
const HEADING_TAG = { 1: 'h1', 2: 'h2', 3: 'h3', 4: 'h4' } as const;
const HEADING_SIZE = {
  1: 'text-3xl',
  2: 'text-2xl',
  3: 'text-xl',
  4: 'text-lg',
} as const;

function BlockRenderer({ block, locale }: { block: ContentBlock; locale: 'ar' | 'en' }) {
  switch (block.type) {
    case 'heading': {
      const Tag = HEADING_TAG[block.level];
      return (
        <Tag id={block.anchor} className={cn('font-bold text-gray-900', HEADING_SIZE[block.level])}>
          {block.text}
        </Tag>
      );
    }

    case 'paragraph':
      return (
        <p
          className={cn('text-gray-700 leading-relaxed', {
            // Logical alignment: `start`/`end` follow dir, so Arabic and
            // English both read correctly. The previous version defaulted to
            // text-right, which is wrong under dir="ltr".
            'text-start': !block.align || block.align === 'left',
            'text-end': block.align === 'right',
            'text-center': block.align === 'center',
            'text-justify': block.align === 'justify',
          })}
        >
          {block.text}
        </p>
      );

    case 'rich-text': {
      // block.content is untrusted stored JSON. generateHTML reproduces its
      // attrs faithfully — including href="javascript:..." — so the output
      // must be sanitized before it reaches the DOM.
      let html: string;
      try {
        html = generateHTML(block.content, tiptapExtensions);
      } catch {
        return null;
      }
      return (
        <div
          className="prose prose-lg max-w-none"
          dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(html) }}
        />
      );
    }

    case 'html':
      // Was rendered raw under a comment claiming it was sanitized.
      return <div dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(block.content) }} />;

    case 'image':
      return (
        <figure
          className={cn('my-8', {
            'max-w-full': block.layout === 'full',
            'max-w-4xl mx-auto': block.layout === 'wide',
            'max-w-2xl mx-auto': block.layout === 'normal',
          })}
        >
          {/* The editor stores real dimensions when it has them. The fallback
              only sizes the placeholder box — `h-auto` means the rendered
              height still follows the file's true aspect ratio. */}
          <Image
            src={block.src}
            alt={block.alt}
            width={block.width ?? 1200}
            height={block.height ?? 800}
            sizes="(max-width: 768px) 100vw, 768px"
            className="h-auto w-full rounded-lg"
          />
          {block.caption && (
            <figcaption className="text-center text-sm text-gray-500 mt-2">
              {block.caption}
            </figcaption>
          )}
        </figure>
      );

    case 'gallery':
      return (
        <div
          className={cn('gap-4', {
            'grid grid-cols-2 md:grid-cols-3': block.layout !== 'masonry',
            'columns-2 md:columns-3': block.layout === 'masonry',
          })}
        >
          {block.images.map((img, idx) => (
            <Image
              key={idx}
              src={img.src}
              alt={img.alt}
              width={800}
              height={600}
              sizes="(max-width: 768px) 100vw, 33vw"
              className="h-auto w-full rounded-lg object-cover"
            />
          ))}
        </div>
      );

    case 'quote':
      return (
        // border-s-4 / ps-4 / rounded-e-lg — logical, so the accent bar sits on
        // the reading-start edge in both directions. Was border-r-4 pr-4.
        <blockquote
          className={cn('py-2 my-6 ps-4 rounded-e-lg', {
            'border-s-4 border-indigo-500 bg-gray-50': block.style === 'bordered',
            'text-xl font-medium': block.style === 'pull',
          })}
        >
          <p className="text-lg text-gray-700 italic">{block.text}</p>
          {block.author && (
            <cite className="block mt-2 text-sm text-gray-500 not-italic">
              — {block.author}
              {block.source && <span className="text-gray-400"> · {block.source}</span>}
            </cite>
          )}
        </blockquote>
      );

    case 'button':
      return (
        <a
          href={block.url}
          className={cn(
            'items-center justify-center rounded-lg font-medium transition-colors',
            block.fullWidth ? 'flex w-full' : 'inline-flex',
            {
              'px-4 py-2 text-sm': block.size === 'sm',
              'px-6 py-3': block.size === 'md',
              'px-8 py-4 text-lg': block.size === 'lg',
            },
            {
              'bg-indigo-600 text-white hover:bg-indigo-700': block.variant === 'primary',
              'bg-gray-200 text-gray-900 hover:bg-gray-300': block.variant === 'secondary',
              'border-2 border-indigo-600 text-indigo-600 hover:bg-indigo-50':
                block.variant === 'outline',
              'text-indigo-600 hover:bg-indigo-50': block.variant === 'ghost',
            }
          )}
        >
          {block.text}
        </a>
      );

    case 'divider':
      if (block.style === 'space') return <div className="h-12" />;
      if (block.style === 'dots')
        return <div className="text-center text-2xl text-gray-300 my-8">• • •</div>;
      if (block.style === 'stars')
        return <div className="text-center text-2xl text-gray-300 my-8">✦ ✦ ✦</div>;
      return <hr className="border-gray-200 my-8" />;

    case 'spacer':
      return <div style={{ height: `${block.height}rem` }} aria-hidden="true" />;

    case 'cta':
      return (
        <section
          className="relative overflow-hidden rounded-xl px-6 py-12 text-center"
          style={
            block.backgroundImage
              ? { backgroundImage: `url(${block.backgroundImage})`, backgroundSize: 'cover' }
              : undefined
          }
        >
          {block.backgroundImage && block.overlay && (
            <div className="absolute inset-0 bg-black/50" aria-hidden="true" />
          )}
          <div className={cn('relative', block.backgroundImage && 'text-white')}>
            <h2 className="text-2xl font-bold">{block.title}</h2>
            <p className="mt-2">{block.text}</p>
            <a
              href={block.button.url}
              className="mt-6 inline-flex rounded-lg bg-indigo-600 px-6 py-3 font-medium text-white hover:bg-indigo-700"
            >
              {block.button.text}
            </a>
          </div>
        </section>
      );

    case 'feature-grid':
      return (
        <div
          className={cn('grid gap-6', {
            'md:grid-cols-2': block.columns === 2,
            'md:grid-cols-3': block.columns === 3,
            'md:grid-cols-2 lg:grid-cols-4': block.columns === 4,
          })}
        >
          {block.items.map((item, idx) => (
            <div key={idx} className="rounded-lg border border-gray-200 p-6 text-start">
              {item.icon && <div className="mb-3 text-2xl">{item.icon}</div>}
              <h3 className="font-semibold text-gray-900">{item.title}</h3>
              <p className="mt-1 text-sm text-gray-600">{item.description}</p>
            </div>
          ))}
        </div>
      );

    case 'testimonial':
      return <TestimonialBlock block={block} />;

    case 'stats':
      return (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {block.items.map((item, idx) => (
            <div key={idx} className="text-center">
              <p className="text-3xl font-bold text-indigo-600" dir="ltr">
                {item.prefix}
                {item.value}
                {item.suffix}
              </p>
              <p className="mt-1 text-sm text-gray-600">{item.label}</p>
            </div>
          ))}
        </div>
      );

    case 'table':
      return (
        // Wide content scrolls in its own container rather than the page body.
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-start">
            {block.headerRow && block.data[0] && (
              <thead>
                <tr>
                  {block.data[0].map((cell, i) => (
                    <th
                      key={i}
                      scope="col"
                      className="border border-gray-200 bg-gray-50 px-3 py-2 text-start text-sm font-semibold"
                    >
                      {cell}
                    </th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody>
              {block.data.slice(block.headerRow ? 1 : 0).map((row, r) => (
                <tr key={r}>
                  {row.map((cell, c) => (
                    <td key={c} className="border border-gray-200 px-3 py-2 text-sm">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );

    case 'video':
      return <VideoBlock block={block} />;

    case 'embed':
      return <EmbedBlock block={block} />;

    case 'team':
      return <TeamBlock block={block} />;

    case 'timeline':
      return <TimelineBlock block={block} />;

    case 'pricing':
      return <PricingBlock block={block} />;

    case 'comparison':
      return <ComparisonBlock block={block} />;

    case 'map':
      return <MapBlock block={block} />;

    case 'social-links':
      return <SocialLinksBlock block={block} />;

    case 'recent-posts':
      return <RecentPostsBlock block={block} locale={locale} />;

    // accordion and tabs nest ContentBlock[], so they recurse through
    // BlockRenderer. Rendered as native <details> / static sections: both stay
    // Server Components and work without JavaScript.
    case 'accordion':
      return (
        <div className="space-y-2">
          {block.items.map((item, idx) => (
            <details key={idx} className="rounded-lg border border-gray-200 p-4">
              <summary className="cursor-pointer font-medium text-gray-900">{item.title}</summary>
              <div className="mt-3 space-y-4">
                {item.content.map((child, i) => (
                  <BlockRenderer key={i} block={child} locale={locale} />
                ))}
              </div>
            </details>
          ))}
        </div>
      );

    case 'tabs':
      return (
        <div className="space-y-6">
          {block.items.map((item, idx) => (
            <section key={idx}>
              <h3 className="mb-3 border-b border-gray-200 pb-2 font-semibold text-gray-900">
                {item.label}
              </h3>
              <div className="space-y-4">
                {item.content.map((child, i) => (
                  <BlockRenderer key={i} block={child} locale={locale} />
                ))}
              </div>
            </section>
          ))}
        </div>
      );

    case 'contact-form':
      return <ContactFormBlock block={block} locale={locale} />;

    case 'newsletter':
      return <NewsletterBlock block={block} locale={locale} />;

    case 'product-grid':
      return <ProductGridBlock block={block} locale={locale} />;

    case 'custom': {
      // Resolved through an explicit allow-list; an unregistered name renders
      // nothing rather than letting stored JSON name any component.
      const Component = resolveCustomBlock(block.component);
      if (!Component) {
        if (process.env.NODE_ENV !== 'production') {
          return (
            <div className="rounded border border-dashed border-amber-400 bg-amber-50 p-4 text-sm text-amber-800">
              Custom block not registered: <code dir="ltr">{block.component}</code>
            </div>
          );
        }
        return null;
      }
      return <Component {...block.props} />;
    }

    default:
      // Every variant of the union now has a case above; this arm only
      // fires for stored JSON carrying an unknown `type`.
      // Silent in production; visible while building so gaps are obvious.
      if (process.env.NODE_ENV !== 'production') {
        return (
          <div className="rounded border border-dashed border-amber-400 bg-amber-50 p-4 text-sm text-amber-800">
            Block type not implemented yet: <code dir="ltr">{(block as { type: string }).type}</code>
          </div>
        );
      }
      return null;
  }
}
