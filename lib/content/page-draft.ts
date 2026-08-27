// lib/content/page-draft.ts
// Shared between the server pages and the client form.
//
// These deliberately live OUTSIDE components/admin/page-form.tsx: that file is
// 'use client', so anything exported from it becomes a client reference. The
// server pages CALL emptyTranslation(), and invoking a client function from a
// Server Component throws at request time:
//   "Attempted to call emptyTranslation() from the server but
//    emptyTranslation is on the client."
// This module has no 'use client' directive, so it is plain shared code.
import type { ContentBlock } from '@/lib/blocks/types';

export interface TranslationDraft {
  locale: 'ar' | 'en';
  title: string;
  excerpt: string;
  body: ContentBlock[];
  metaTitle: string;
  metaDescription: string;
  ogImage: string;
  noIndex: boolean;
}

export interface PageFormValue {
  slug: string;
  status: 'draft' | 'published' | 'archived';
  featuredImage: string;
  translations: TranslationDraft[];
  /** Taxonomy is per-item, not per-locale — a translation is the same article. */
  categoryIds: string[];
  tagIds: string[];
}

export interface TaxonomyOption {
  id: string;
  label: string;
  isChild?: boolean;
}

export function emptyTranslation(locale: 'ar' | 'en'): TranslationDraft {
  return {
    locale,
    title: '',
    excerpt: '',
    body: [],
    metaTitle: '',
    metaDescription: '',
    ogImage: '',
    noIndex: false,
  };
}
