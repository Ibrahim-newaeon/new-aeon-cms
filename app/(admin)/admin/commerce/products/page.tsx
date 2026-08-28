// app/(admin)/admin/commerce/products/page.tsx
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { listProductsForAdmin } from '@/lib/commerce/products';
import { getSettings } from '@/lib/db/queries';
import { ProductsTable, type ProductRow } from '@/components/admin/products-table';
import { createTranslator } from '@/lib/admin-i18n';
import { getAdminLocale } from '@/lib/admin-i18n/server';

const ADMIN_PATH = process.env.ADMIN_PATH || '/admin';

export default async function ProductsPage() {
  const t = createTranslator(await getAdminLocale());
  const [rows, settings] = await Promise.all([listProductsForAdmin('ar'), getSettings()]);
  const currency = settings?.currency ?? 'JOD';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--admin-text)]">{t('products.title')}</h1>
          <p className="mt-1 text-sm text-[var(--admin-text-muted)]">{t('products.subtitle')}</p>
        </div>
        <Link href={`${ADMIN_PATH}/commerce/products/new`} className="admin-btn" data-test-id="products-new">
          <Plus size={18} aria-hidden="true" />
          {t('products.new')}
        </Link>
      </div>

      <ProductsTable rows={rows as ProductRow[]} basePath={`${ADMIN_PATH}/commerce/products`} currency={currency} />
    </div>
  );
}
