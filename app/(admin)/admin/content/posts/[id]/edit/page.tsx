// app/(admin)/admin/content/posts/[id]/edit/page.tsx
import { notFound } from 'next/navigation';
import { getContentById } from '@/lib/db/queries';
import { PageForm } from '@/components/admin/page-form';
import { emptyTranslation, type TranslationDraft } from '@/lib/content/page-draft';
import { asContentBlocks } from '@/lib/blocks/content-schema';
import {
  listTaxonomyOptions, getTypeTaxonomyFlags, getContentTaxonomy,
} from '@/lib/content/taxonomy';

const ADMIN_PATH = process.env.ADMIN_PATH || '/admin';
const LOCALES = ['ar', 'en'] as const;

export default async function EditPost({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const record = await getContentById(id);

  if (!record) notFound();

  const [options, flags, assigned] = await Promise.all([
    listTaxonomyOptions('ar'),
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
