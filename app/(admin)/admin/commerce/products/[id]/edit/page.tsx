// app/(admin)/admin/commerce/products/[id]/edit/page.tsx
import { notFound } from 'next/navigation';
import { getProductForEdit, getProductFormOptions } from '@/lib/commerce/products';
import { getSettings } from '@/lib/db/queries';
import { ProductForm } from '@/components/admin/product-form';
import {
  emptyProductTranslation,
  type ProductTranslationDraft,
  type VariantDraft,
} from '@/lib/commerce/product-draft';

const ADMIN_PATH = process.env.ADMIN_PATH || '/admin';
const LOCALES = ['ar', 'en'] as const;

export default async function EditProduct({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [record, options, settings] = await Promise.all([
    getProductForEdit(id),
    getProductFormOptions('ar'),
    getSettings(),
  ]);

  if (!record) notFound();

  const translations: ProductTranslationDraft[] = LOCALES.map((locale) => {
    const row = record.i18n.find((t) => t.locale === locale);
    if (!row) return emptyProductTranslation(locale);
    return {
      locale,
      name: row.name,
      shortDesc: row.shortDesc ?? '',
      description: row.description ?? '',
      metaTitle: row.metaTitle ?? '',
      metaDescription: row.metaDescription ?? '',
    };
  });

  const variants: VariantDraft[] = record.variants.map((v) => ({
    sku: v.sku,
    price: v.price,
    stock: v.stock ?? 0,
    isActive: v.isActive ?? true,
    optionValues: v.optionValues,
  }));

  return (
    <ProductForm
      mode="edit"
      productId={record.product.id}
      adminPath={ADMIN_PATH}
      currency={settings?.currency ?? 'JOD'}
      brands={options.brands}
      categories={options.categories}
      initial={{
        slug: record.product.slug,
        brandId: record.product.brandId,
        categoryIds: record.categoryIds,
        basePrice: record.product.basePrice,
        compareAtPrice: record.product.compareAtPrice,
        isActive: record.product.isActive ?? true,
        sortOrder: record.product.sortOrder ?? 0,
        translations,
        images: record.images.map((i) => ({ url: i.url, alt: i.alt ?? '' })),
        specs: record.specs.map((s) => ({ locale: s.locale, key: s.key, value: s.value })),
        options: record.options.map((o, i) => ({ name: o.name, position: o.position ?? i })),
        variants,
      }}
    />
  );
}
