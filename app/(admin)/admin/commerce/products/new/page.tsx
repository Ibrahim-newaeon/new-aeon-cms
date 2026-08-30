// app/(admin)/admin/commerce/products/new/page.tsx
import { getProductFormOptions } from '@/lib/commerce/products';
import { getSettings } from '@/lib/db/queries';
import { ProductForm } from '@/components/admin/product-form';
import { emptyProductTranslation } from '@/lib/commerce/product-draft';

const ADMIN_PATH = process.env.ADMIN_PATH || '/admin';

export default async function NewProduct() {
  const [options, settings] = await Promise.all([getProductFormOptions('ar'), getSettings()]);

  return (
    <ProductForm
      mode="create"
      adminPath={ADMIN_PATH}
      currency={settings?.currency ?? 'JOD'}
      brands={options.brands}
      categories={options.categories}
      initial={{
        slug: '',
        brandId: null,
        categoryIds: [],
        basePrice: 0,
        compareAtPrice: null,
        isActive: true,
        sortOrder: 0,
        translations: [emptyProductTranslation('ar'), emptyProductTranslation('en')],
        images: [],
        specs: [],
        options: [],
        variants: [],
      }}
    />
  );
}
