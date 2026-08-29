// app/(admin)/admin/content/pages/new/page.tsx
import { PageForm } from '@/components/admin/page-form';
import { emptyTranslation } from '@/lib/content/page-draft';
import { listTaxonomyOptions, getTypeTaxonomyFlags } from '@/lib/content/taxonomy';
import { getAdminLocale } from '@/lib/admin-i18n/server';

const ADMIN_PATH = process.env.ADMIN_PATH || '/admin';

export default async function NewPage() {
  const [options, flags] = await Promise.all([
    listTaxonomyOptions(await getAdminLocale()),
    getTypeTaxonomyFlags('page'),
  ]);

  return (
    <PageForm
      mode="create"
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
