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
          render: (row) => (
            <span className={`text-xs px-2 py-1 rounded-full ${
              row.isActive ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'
            }`}>
              {row.isActive ? t('products.visible') : t('products.hidden')}
            </span>
          ),
        },
      ]}
    />
  );
}
