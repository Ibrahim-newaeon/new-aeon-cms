// app/(admin)/admin/content/posts/new/page.tsx
import { PageForm } from '@/components/admin/page-form';
import { emptyTranslation } from '@/lib/content/page-draft';
import { listTaxonomyOptions, getTypeTaxonomyFlags } from '@/lib/content/taxonomy';
import { getAdminLocale } from '@/lib/admin-i18n/server';
import { resolveStorefrontPresentation } from '@/lib/themes/active';
import { unsupportedPackBlocks } from '@/lib/themes/pack-blocks';
import { ALL_BLOCK_TYPES } from '@/lib/blocks/defaults';

const ADMIN_PATH = process.env.ADMIN_PATH || '/admin';

export default async function NewPost() {
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
  const [options, flags] = await Promise.all([
    listTaxonomyOptions(await getAdminLocale()),
    getTypeTaxonomyFlags('post'),
  ]);

  return (
    <PageForm
      unsupportedBlocks={unsupportedBlocks}
      mode="create"
      contentType="post"
      adminPath={ADMIN_PATH}
      taxonomy={{ ...options, ...flags }}
      initial={{
        slug: '',
        status: 'draft',
        featuredImage: '',
        translations: [emptyTranslation('ar'), emptyTranslation('en')],
        categoryIds: [],
        tagIds: [],
      }}
    />
  );
}
