// app/(admin)/admin/commerce/products/page.tsx
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { listProductsForAdmin } from '@/lib/commerce/products';
import { getSettings } from '@/lib/db/queries';
import { ProductsTable, type ProductRow } from '@/components/admin/products-table';

const ADMIN_PATH = process.env.ADMIN_PATH || '/admin';

export default async function ProductsPage() {
  const [rows, settings] = await Promise.all([listProductsForAdmin('ar'), getSettings()]);
  const currency = settings?.currency ?? 'JOD';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--admin-text)]">المنتجات</h1>
          <p className="mt-1 text-sm text-[var(--admin-text-muted)]">كتالوج المنتجات ومتغيّراتها.</p>
        </div>
        <Link href={`${ADMIN_PATH}/commerce/products/new`} className="admin-btn" data-test-id="products-new">
          <Plus size={18} aria-hidden="true" />
          منتج جديد
        </Link>
      </div>

      <ProductsTable rows={rows as ProductRow[]} basePath={`${ADMIN_PATH}/commerce/products`} currency={currency} />
    </div>
  );
}
