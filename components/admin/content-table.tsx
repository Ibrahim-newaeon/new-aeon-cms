// components/admin/content-table.tsx
'use client';

import { useRouter } from 'next/navigation';
import { DataTable } from '@/components/admin/data-table';

/**
 * Shared list table for every content type. Pages and Posts differ only in
 * their base path and labels, so they share this rather than duplicating the
 * column definitions (which must live in a Client Component — see pages-table
 * history: `render` callbacks cannot cross the server boundary).
 */
export interface ContentRow extends Record<string, unknown> {
  id: string;
  slug: string;
  status: 'draft' | 'published' | 'archived' | null;
  title: string | null;
  createdAt: string | null;
}

const STATUS_LABEL: Record<'draft' | 'published' | 'archived', string> = {
  published: 'منشور',
  draft: 'مسودة',
  archived: 'مؤرشف',
};

const STATUS_CLASS: Record<'draft' | 'published' | 'archived', string> = {
  published: 'bg-green-500/20 text-green-400',
  draft: 'bg-yellow-500/20 text-yellow-400',
  archived: 'bg-gray-500/20 text-gray-400',
};

export function ContentTable({ rows, basePath }: { rows: ContentRow[]; basePath: string }) {
  const router = useRouter();

  return (
    <DataTable<ContentRow>
      data={rows}
      keyField="id"
      searchFields={['title', 'slug']}
      editPath={basePath}
      deleteEndpoint="/api/content"
      onDeleted={() => router.refresh()}
      columns={[
        { key: 'title', header: 'العنوان', sortable: true },
        { key: 'slug', header: 'الرابط', sortable: true },
        {
          key: 'status',
          header: 'الحالة',
          render: (row) => {
            const status = row.status ?? 'draft';
            return (
              <span className={`text-xs px-2 py-1 rounded-full ${STATUS_CLASS[status]}`}>
                {STATUS_LABEL[status]}
              </span>
            );
          },
        },
        {
          key: 'createdAt',
          header: 'تاريخ الإنشاء',
          render: (row) =>
            row.createdAt ? new Date(row.createdAt).toLocaleDateString('ar-SA') : '—',
        },
      ]}
    />
  );
}
