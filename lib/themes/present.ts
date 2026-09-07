// lib/themes/present.ts
// Shared helper: build ThemePackView props for a marketing page.

import { getNavigation, getSettings } from '@/lib/db/queries';
import { asContentBlocks } from '@/lib/blocks/content-schema';
import type { ContentBlock } from '@/lib/blocks/types';
import type { HtmlPasteMode } from '@/lib/blocks/sanitize';
import { blocksToHtml } from './blocks-to-html';
import { resolveStorefrontPresentation } from './active';
import { renderThemePage } from './render';
import type { ThemeableKind } from './package';

export async function tryRenderThemePack(opts: {
  kind: Exclude<ThemeableKind, null>;
  locale: 'ar' | 'en';
  title: string;
  excerpt?: string | null;
  slug?: string;
  body: unknown;
  posts?: { title: string; excerpt?: string | null; url: string }[];
}): Promise<{ html: string; cssHrefs: string[]; jsHrefs: string[] } | null> {
  const presentation = await resolveStorefrontPresentation();
  if (presentation.driver !== 'html-pack' || !presentation.theme) return null;

  const settings = await getSettings();
  const nav = await getNavigation('header', opts.locale);
  const pasteMode = (settings?.htmlPasteMode as HtmlPasteMode | null) ?? 'safe';
  const blocks = asContentBlocks(opts.body) as ContentBlock[];
  const content = blocksToHtml(blocks, pasteMode);

  return renderThemePage(presentation.theme.id, presentation.theme.manifest, opts.kind, {
    locale: opts.locale,
    dir: opts.locale === 'ar' ? 'rtl' : 'ltr',
    site: {
      name: settings?.siteName ?? 'CMS',
      description: settings?.siteDescription,
      logo: settings?.logo,
    },
    page: {
      title: opts.title,
      excerpt: opts.excerpt,
      content,
      slug: opts.slug,
    },
    posts: opts.posts,
    navigation: nav.map((n) => ({ label: n.label, url: n.url })),
  });
}
