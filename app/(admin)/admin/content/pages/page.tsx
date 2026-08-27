// app/(admin)/admin/content/pages/page.tsx
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { listContentByType } from '@/lib/content/list';
import { ContentTable } from '@/components/admin/content-table';

const ADMIN_PATH = process.env.ADMIN_PATH || '/admin';

export default async function PagesPage() {
  const rows = await listContentByType('page', 'ar');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--admin-text)]">الصفحات</h1>
          <p className="mt-1 text-sm text-[var(--admin-text-muted)]">إدارة صفحات الموقع الثابتة</p>
        </div>
        <Link href={`${ADMIN_PATH}/content/pages/new`} className="admin-btn" data-test-id="pages-new">
          <Plus size={18} aria-hidden="true" />
          صفحة جديدة
        </Link>
      </div>

      <ContentTable rows={rows} basePath={`${ADMIN_PATH}/content/pages`} />
    </div>
  );
}
