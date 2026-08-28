// components/admin/pages-table.tsx
'use client';

import { useRouter } from 'next/navigation';
import { DataTable } from '@/components/admin/data-table';
import { useT } from './i18n-provider';

/**
 * Column definitions carry `render` callbacks — functions. A Server Component
 * cannot pass functions across the client boundary, so the columns are declared
 * HERE, inside a Client Component, rather than in the server page.
 *
 * The server page passes only serializable data (rows) into this wrapper.
 */
export interface PageRow extends Record<string, unknown> {
  id: string;
  slug: string;
  status: 'draft' | 'published' | 'archived' | null;
  title: string | null;
  createdAt: string | null;
}

const STATUS_CLASS: Record<'draft' | 'published' | 'archived', string> = {
  published: 'bg-green-500/20 text-green-400',
  draft: 'bg-yellow-500/20 text-yellow-400',
  archived: 'bg-gray-500/20 text-gray-400',
};

export function PagesTable({ rows, adminPath }: { rows: PageRow[]; adminPath: string }) {
  const router = useRouter();
  const t = useT();

  // Built inside the component rather than at module scope: it needs the
  // translator, and a hook cannot be called at module level.
  const STATUS_LABEL: Record<'draft' | 'published' | 'archived', string> = {
    published: t('status.published'),
    draft: t('status.draft'),
    archived: t('status.archived'),
  };


  return (
    <DataTable<PageRow>
      data={rows}
      keyField="id"
      searchFields={['title', 'slug']}
      editPath={`${adminPath}/content/pages`}
      onDeleted={() => router.refresh()}
      deleteEndpoint="/api/content"
      columns={[
        { key: 'title', header: t('pages.colTitle'), sortable: true },
        { key: 'slug', header: t('common.slug'), sortable: true },
        {
          key: 'status',
          header: t('common.status'),
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
          header: t('common.createdAt'),
          // Formatted client-side so server and client agree on timezone.
          render: (row) =>
            row.createdAt ? new Date(row.createdAt).toLocaleDateString('ar-SA') : '—',
        },
      ]}
    />
  );
}
