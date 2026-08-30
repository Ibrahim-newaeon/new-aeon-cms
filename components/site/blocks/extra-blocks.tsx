// components/site/blocks/extra-blocks.tsx
// Renderers for the layout blocks that live outside content-renderer's core
// switch, kept here so that file stays readable.
import Image from 'next/image';
import { cache } from 'react';
import { db } from '@/lib/db';
import { content, contentI18n, settings } from '@/lib/db/schema';
import { and, desc, eq } from 'drizzle-orm';
import { cn } from '@/lib/utils';
import type { ContentBlock } from '@/lib/blocks/types';

import { youTubeEmbedUrl, youTubeId } from '@/lib/blocks/youtube';

type Pick_<T extends ContentBlock['type']> = Extract<ContentBlock, { type: T }>;

/** youtube/vimeo ids only; anything else falls back to a plain link. */
function embedSrc(block: Pick_<'video'>): string | null {
  try {
    const url = new URL(block.url);
    if (block.provider === 'youtube') {
      // Shared with the slider. The old inline version took the last path
      // segment, so a channel URL produced an embed of the channel name.
      const id = youTubeId(block.url);
      return id ? youTubeEmbedUrl(id, { controls: true }) : null;
    }
    if (block.provider === 'vimeo') {
      const id = url.pathname.split('/').filter(Boolean).pop();
      return id ? `https://player.vimeo.com/video/${encodeURIComponent(id)}` : null;
    }
    return null;
  } catch {
    return null;
  }
}

export function VideoBlock({ block }: { block: Pick_<'video'> }) {
  if (block.provider === 'self') {
    return (
      <video controls poster={block.poster} className="w-full rounded-lg" preload="metadata">
        <source src={block.url} />
      </video>
    );
  }

  const src = embedSrc(block);
  if (!src) return null;

  return (
    // frame-src in the CSP must allow these hosts; see middleware.ts.
    <div className="relative aspect-video overflow-hidden rounded-lg">
      <iframe
        src={src}
        title="video"
        loading="lazy"
        allow="accelerometer; clipboard-write; encrypted-media; picture-in-picture"
        allowFullScreen
        className="absolute inset-0 h-full w-full"
      />
    </div>
  );
}

/**
 * Social embeds require each network's own <script>, which the CSP blocks by
 * design. Rendering a link card is the honest option: it always works, needs no
 * third-party JS, and leaks nothing about the visitor.
 */
export function EmbedBlock({ block }: { block: Pick_<'embed'> }) {
  return (
    <a
      href={block.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center justify-between gap-4 rounded-lg border border-gray-200 p-4 transition-colors hover:bg-gray-50"
    >
      <span className="text-sm font-medium text-gray-900 capitalize">{block.provider}</span>
      <span className="truncate text-sm text-gray-500" dir="ltr">
        {block.url}
      </span>
    </a>
  );
}

export function TeamBlock({ block }: { block: Pick_<'team'> }) {
  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {block.members.map((m, idx) => (
        <div key={idx} className="rounded-lg border border-gray-200 p-6 text-center">
          {m.photo ? (
            <Image
              src={m.photo}
              alt=""
              width={96}
              height={96}
              className="mx-auto h-24 w-24 rounded-full object-cover"
            />
          ) : (
            <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-indigo-100 text-2xl font-semibold text-indigo-700">
              {m.name.trim().charAt(0)}
            </div>
          )}
          <h3 className="mt-4 font-semibold text-gray-900">{m.name}</h3>
          <p className="text-sm text-gray-500">{m.role}</p>
          {m.bio && <p className="mt-2 text-sm text-gray-600">{m.bio}</p>}
        </div>
      ))}
    </div>
  );
}

export function TimelineBlock({ block }: { block: Pick_<'timeline'> }) {
  return (
    // border-s / ps / start-0 keep the rail on the reading-start edge in RTL.
    <ol className="relative ms-3 border-s-2 border-gray-200 ps-6">
      {block.items.map((item, idx) => (
        <li key={idx} className="mb-8 last:mb-0">
          <span
            aria-hidden="true"
            className="absolute -start-[9px] mt-1.5 h-4 w-4 rounded-full border-2 border-white bg-indigo-500"
          />
          <time className="text-xs text-gray-500" dir="ltr">
            {item.date}
          </time>
          <h3 className="mt-1 font-semibold text-gray-900">{item.title}</h3>
          <p className="mt-1 text-sm text-gray-600">{item.description}</p>
        </li>
      ))}
    </ol>
  );
}

export function PricingBlock({ block }: { block: Pick_<'pricing'> }) {
  return (
    <div className="grid gap-6 md:grid-cols-3">
      {block.plans.map((plan, idx) => (
        <div
          key={idx}
          className={cn(
            'flex flex-col rounded-xl border p-6',
            plan.highlighted ? 'border-indigo-500 shadow-lg' : 'border-gray-200'
          )}
        >
          <h3 className="font-semibold text-gray-900">{plan.name}</h3>
          <p className="mt-2">
            <span className="text-3xl font-bold" dir="ltr">
              {plan.price}
            </span>
            {plan.period && <span className="text-sm text-gray-500"> / {plan.period}</span>}
          </p>
          <ul className="mt-4 flex-1 space-y-2 text-sm text-gray-600">
            {plan.features.map((f, i) => (
              <li key={i} className="flex gap-2">
                <span aria-hidden="true" className="text-indigo-500">
                  ✓
                </span>
                {f}
              </li>
            ))}
          </ul>
          <a
            href={plan.cta.url}
            className={cn(
              'mt-6 rounded-lg px-4 py-2.5 text-center text-sm font-medium',
              plan.highlighted
                ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                : 'border border-gray-300 text-gray-900 hover:bg-gray-50'
            )}
          >
            {plan.cta.text}
          </a>
        </div>
      ))}
    </div>
  );
}

export function ComparisonBlock({ block }: { block: Pick_<'comparison'> }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th scope="col" className="border border-gray-200 bg-gray-50 px-3 py-2 text-start" />
            {block.columns.map((col) => (
              <th
                key={col}
                scope="col"
                className="border border-gray-200 bg-gray-50 px-3 py-2 text-start font-semibold"
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.items.map((row, idx) => (
            <tr key={idx}>
              <th scope="row" className="border border-gray-200 px-3 py-2 text-start font-medium">
                {row.feature}
              </th>
              {block.columns.map((col) => {
                const v = row.values[col];
                return (
                  <td key={col} className="border border-gray-200 px-3 py-2">
                    {typeof v === 'boolean' ? (
                      <span aria-label={v ? 'نعم' : 'لا'}>{v ? '✓' : '—'}</span>
                    ) : (
                      (v ?? '—')
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function MapBlock({ block }: { block: Pick_<'map'> }) {
  const { lat, lng } = block.location;
  const zoom = block.zoom ?? 13;
  // Static link rather than an embedded map: an iframe would need a third-party
  // frame-src entry and would load trackers before the visitor opts in.
  return (
    <a
      href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=${zoom}/${lat}/${lng}`}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center justify-between gap-4 rounded-lg border border-gray-200 p-4 hover:bg-gray-50"
    >
      <span className="text-sm font-medium text-gray-900">{block.marker ?? 'الموقع على الخريطة'}</span>
      <span className="text-sm text-gray-500" dir="ltr">
        {lat.toFixed(4)}, {lng.toFixed(4)}
      </span>
    </a>
  );
}

const SOCIAL_URL: Record<string, string> = {
  facebook: 'https://facebook.com/',
  instagram: 'https://instagram.com/',
  twitter: 'https://twitter.com/',
  linkedin: 'https://linkedin.com/in/',
  youtube: 'https://youtube.com/',
  tiktok: 'https://tiktok.com/@',
};

/**
 * Turns a saved handle into a URL.
 *
 * The settings form is a free-text field, so an editor may type a full URL or a
 * bare username with equal confidence. A bare username concatenated onto the
 * platform prefix is the intent in both cases; anything already absolute is
 * left alone. An unknown platform with no handle yields '#' rather than a
 * broken link to nowhere.
 */
function socialHref(platform: string, handle: string | undefined): string {
  const base = SOCIAL_URL[platform];
  const value = handle?.trim();

  if (!value) return base ?? '#';
  if (/^https?:\/\//i.test(value)) return value;

  return base ? `${base}${value.replace(/^@/, '')}` : '#';
}

/**
 * Saved handles, deduped per request.
 *
 * React's cache() means several social-links blocks on one page — or a repeat
 * render — issue a single query, not one each.
 */
const getSocialHandles = cache(async (): Promise<Record<string, string>> => {
  try {
    const rows = await db.select({ links: settings.socialLinks }).from(settings).limit(1);
    const links = rows[0]?.links;
    return links && typeof links === 'object' ? (links as Record<string, string>) : {};
  } catch {
    // Settings being unreadable must not take down a whole page for a
    // decorative block; the platform home pages below still render.
    return {};
  }
});

/**
 * Reads its own handles instead of taking them as a prop.
 *
 * It used to accept `handles`, and content-renderer never passed it — so every
 * icon silently linked to the platform's bare home page while the editor's
 * saved handles sat unused in settings. A prop that every caller must remember
 * is exactly the shape of that bug; RecentPostsBlock below already fetches its
 * own data for the same reason.
 */
export async function SocialLinksBlock({
  block,
}: {
  block: Pick_<'social-links'>;
}) {
  const handles = await getSocialHandles();

  return (
    <ul className="flex flex-wrap items-center gap-3">
      {block.platforms.map((p) => {
        const href = socialHref(p, handles[p]);
        return (
          <li key={p}>
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={p}
              className={cn(
                'inline-flex items-center justify-center capitalize',
                block.style === 'buttons'
                  ? 'rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50'
                  : 'h-10 w-10 rounded-full bg-gray-100 text-xs hover:bg-gray-200'
              )}
            >
              {block.style === 'buttons' ? p : p.slice(0, 2)}
            </a>
          </li>
        );
      })}
    </ul>
  );
}

/** Async server component — queries published posts directly. */
export async function RecentPostsBlock({
  block,
  locale,
}: {
  block: Pick_<'recent-posts'>;
  locale: 'ar' | 'en';
}) {
  const rows = await db
    .select({
      slug: content.slug,
      title: contentI18n.title,
      excerpt: contentI18n.excerpt,
    })
    .from(content)
    .leftJoin(
      contentI18n,
      and(eq(content.id, contentI18n.contentId), eq(contentI18n.locale, locale))
    )
    .where(eq(content.status, 'published'))
    .orderBy(desc(content.publishedAt))
    .limit(Math.min(Math.max(block.count, 1), 12));

  if (rows.length === 0) return null;

  return (
    <section>
      {block.title && <h2 className="mb-4 text-xl font-bold text-gray-900">{block.title}</h2>}
      <div
        className={cn(
          block.layout === 'grid' ? 'grid gap-6 sm:grid-cols-2 lg:grid-cols-3' : 'space-y-4'
        )}
      >
        {rows.map((row) => (
          <a
            key={row.slug}
            href={`/${locale}/${row.slug}`}
            className="block rounded-lg border border-gray-200 p-4 hover:bg-gray-50"
          >
            <h3 className="font-semibold text-gray-900">{row.title ?? row.slug}</h3>
            {row.excerpt && <p className="mt-1 text-sm text-gray-600">{row.excerpt}</p>}
          </a>
        ))}
      </div>
    </section>
  );
}
