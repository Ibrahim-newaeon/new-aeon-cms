// app/(admin)/admin/content/posts/[id]/edit/page.tsx
import { notFound } from 'next/navigation';
import { getContentById } from '@/lib/db/queries';
import { PageForm } from '@/components/admin/page-form';
import { emptyTranslation, type TranslationDraft } from '@/lib/content/page-draft';
import { asContentBlocks } from '@/lib/blocks/content-schema';
import {
  listTaxonomyOptions, getTypeTaxonomyFlags, getContentTaxonomy,
} from '@/lib/content/taxonomy';
import { getAdminLocale } from '@/lib/admin-i18n/server';
import { resolveStorefrontPresentation } from '@/lib/themes/active';
import { unsupportedPackBlocks } from '@/lib/themes/pack-blocks';
import { ALL_BLOCK_TYPES } from '@/lib/blocks/defaults';

const ADMIN_PATH = process.env.ADMIN_PATH || '/admin';
const LOCALES = ['ar', 'en'] as const;

export default async function EditPost({ params }: { params: Promise<{ id: string }> }) {
  /*
   * What the active presentation will NOT render, for the block picker.
   *
   * Computed here because only the server knows the active pack, and what a
   * pack renders is the shared ten plus whatever `block-<type>` partials it
   * ships. On the builtin driver nothing is unsupported, so the list is empty
   * and the picker stays silent.
   */
  const presentation = await resolveStorefrontPresentation();
  const unsupportedBlocks =
    presentation.driver === 'html-pack'
      ? unsupportedPackBlocks(ALL_BLOCK_TYPES, presentation.theme?.manifest.partials)
      : [];
  const { id } = await params;
  const record = await getContentById(id);

  if (!record) notFound();

  const [options, flags, assigned] = await Promise.all([
    listTaxonomyOptions(await getAdminLocale()),
    getTypeTaxonomyFlags('post'),
    getContentTaxonomy(record.content.id),
  ]);

  // One draft per locale, whether or not a row exists yet — the form always
  // renders both tabs, and empty ones are dropped before saving.
  const translations: TranslationDraft[] = LOCALES.map((locale) => {
    const row = record.translations.find((t) => t.locale === locale);
    if (!row) return emptyTranslation(locale);
    return {
      locale,
      title: row.title,
      excerpt: row.excerpt ?? '',
      body: asContentBlocks(row.body),
      metaTitle: row.metaTitle ?? '',
      metaDescription: row.metaDescription ?? '',
      ogImage: row.ogImage ?? '',
      noIndex: row.noIndex ?? false,
    };
  });

  return (
    <PageForm
      unsupportedBlocks={unsupportedBlocks}
      mode="edit"
      contentType="post"
      contentId={record.content.id}
      adminPath={ADMIN_PATH}
      taxonomy={{ ...options, ...flags }}
      initial={{
        slug: record.content.slug,
        status: record.content.status ?? 'draft',
        featuredImage: record.content.featuredImage ?? '',
        translations,
        categoryIds: assigned.categoryIds,
        tagIds: assigned.tagIds,
      }}
    />
  );
}
