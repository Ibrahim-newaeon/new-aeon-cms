// app/(admin)/admin/content/posts/new/page.tsx
import { PageForm } from '@/components/admin/page-form';
import { emptyTranslation } from '@/lib/content/page-draft';
import { listTaxonomyOptions, getTypeTaxonomyFlags } from '@/lib/content/taxonomy';
import { getAdminLocale } from '@/lib/admin-i18n/server';
import { getSettings } from '@/lib/db/queries';

const ADMIN_PATH = process.env.ADMIN_PATH || '/admin';

export default async function NewPost() {
  // Only the block picker uses this: under a theme pack most block
  // types render as nothing, and the picker says so.
  const driver = (await getSettings())?.themeDriver;
  const [options, flags] = await Promise.all([
    listTaxonomyOptions(await getAdminLocale()),
    getTypeTaxonomyFlags('post'),
  ]);

  return (
    <PageForm
      themeDriver={driver === 'html-pack' ? 'html-pack' : 'builtin'}
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
