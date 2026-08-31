// components/admin/products-table.tsx
'use client';

import { useRouter } from 'next/navigation';
import { DataTable } from '@/components/admin/data-table';
import { formatPrice } from '@/lib/money';
import { useT } from './i18n-provider';

export interface ProductRow extends Record<string, unknown> {
  id: string;
  slug: string;
  name: string | null;
  basePrice: number;
  isActive: boolean | null;
  /** Languages this product has a name in. Short of all of them, it is not live. */
  missingLocales: string[];
  variantCount: number;
  createdAt: string | null;
}

export function ProductsTable({
  rows, basePath, currency,
}: {
  rows: ProductRow[];
  basePath: string;
  currency: string;
}) {
  const router = useRouter();
  const t = useT();

  return (
    <DataTable<ProductRow>
      data={rows}
      keyField="id"
      searchFields={['name', 'slug']}
      editPath={basePath}
      deleteEndpoint="/api/commerce/products"
      onDeleted={() => router.refresh()}
      emptyMessage={t('products.empty')}
      columns={[
        { key: 'name', header: t('common.name'), sortable: true },
        { key: 'slug', header: t('common.slug'), sortable: true },
        {
          key: 'basePrice',
          header: t('products.colPrice'),
          sortable: true,
          render: (row) => <span dir="ltr">{formatPrice(row.basePrice, currency, 'ar')}</span>,
        },
        {
          key: 'variantCount',
          header: t('products.colVariants'),
          render: (row) => <span dir="ltr">{row.variantCount}</span>,
        },
        {
          key: 'isActive',
          header: t('common.status'),
          render: (row) => {
            /**
             * Switched ON but not reachable: a shopper cannot read it in every
             * language the site publishes, so ./live.ts keeps it off the
             * storefront. Shown as its own state rather than as "visible",
             * which would be a lie, or "hidden", which would suggest someone
             * chose it.
             */
            const blocked = Boolean(row.isActive) && row.missingLocales.length > 0;

            if (blocked) {
              return (
                <span
                  className="rounded-full bg-amber-500/20 px-2 py-1 text-xs text-amber-300"
                  title={t('products.needsTranslationHint')}
                  data-test-id="product-needs-translation"
                >
                  {t('products.needsTranslation', {
                    list: row.missingLocales.map((l) => l.toUpperCase()).join(', '),
                  })}
                </span>
              );
            }

            return (
              <span className={`text-xs px-2 py-1 rounded-full ${
                row.isActive ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'
              }`}>
                {row.isActive ? t('products.visible') : t('products.hidden')}
              </span>
            );
          },
        },
      ]}
    />
  );
}
