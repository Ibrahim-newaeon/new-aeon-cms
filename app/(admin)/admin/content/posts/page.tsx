// app/(admin)/admin/content/posts/page.tsx
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { listContentByType } from '@/lib/content/list';
import { ContentTable } from '@/components/admin/content-table';

const ADMIN_PATH = process.env.ADMIN_PATH || '/admin';

export default async function PostsPage() {
  const rows = await listContentByType('post', 'ar');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--admin-text)]">المقالات</h1>
          <p className="mt-1 text-sm text-[var(--admin-text-muted)]">إدارة مقالات المدونة</p>
        </div>
        <Link href={`${ADMIN_PATH}/content/posts/new`} className="admin-btn" data-test-id="posts-new">
          <Plus size={18} aria-hidden="true" />
          مقال جديد
        </Link>
      </div>

      <ContentTable rows={rows} basePath={`${ADMIN_PATH}/content/posts`} />
    </div>
  );
}
