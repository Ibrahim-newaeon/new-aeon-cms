// components/admin/data-table.tsx
'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Search, ArrowUpDown, Eye, Edit, Trash2, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface Column<T> {
  key: keyof T | string;
  header: string;
  sortable?: boolean;
  width?: string;
  /**
   * Safe to declare here: DataTable and its callers are both Client
   * Components. Never build these in a Server Component — functions cannot
   * cross the server/client boundary.
   */
  render?: (row: T) => React.ReactNode;
}

interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  keyField: keyof T;
  searchable?: boolean;
  searchFields?: (keyof T)[];
  sortable?: boolean;
  editPath?: string;
  deleteEndpoint?: string;
  viewPath?: string;
  /** Called after a successful delete, e.g. to router.refresh(). */
  onDeleted?: (id: string) => void;
  emptyMessage?: string;
}

export function DataTable<T extends Record<string, unknown>>({
  data,
  columns,
  keyField,
  searchable = true,
  searchFields,
  sortable = true,
  editPath,
  deleteEndpoint,
  viewPath,
  onDeleted,
  emptyMessage = 'لا توجد عناصر لعرضها',
}: DataTableProps<T>) {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Was `useCallback(fn, deps)()` — invoked immediately, so the memo never
  // applied. useMemo is what that intended.
  const processedData = useMemo(() => {
    let result = [...data];

    if (searchQuery && searchFields) {
      const query = searchQuery.toLowerCase();
      result = result.filter((row) =>
        searchFields.some((field) => {
          const value = row[field];
          return value != null && String(value).toLowerCase().includes(query);
        })
      );
    }

    if (sortField && sortable) {
      result.sort((a, b) => {
        const aVal = a[sortField as keyof T];
        const bVal = b[sortField as keyof T];
        if (aVal == null && bVal == null) return 0;
        if (aVal == null) return 1;
        if (bVal == null) return -1;
        const comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
        return sortDirection === 'asc' ? comparison : -comparison;
      });
    }

    return result;
  }, [data, searchQuery, searchFields, sortField, sortDirection, sortable]);

  const toggleSort = (field: string) => {
    if (!sortable) return;
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  /**
   * Was a bare <form method="POST"> against the delete endpoint — submittable
   * cross-origin by any page, i.e. one-click CSRF. A same-origin fetch with
   * method DELETE cannot be forged by a cross-site form.
   */
  const handleDelete = async (id: string) => {
    if (!deleteEndpoint) return;
    if (!window.confirm('هل أنت متأكد من الحذف؟')) return;

    setDeletingId(id);
    setError(null);
    try {
      const res = await fetch(`${deleteEndpoint}/${id}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      });
      if (!res.ok) throw new Error('Delete failed');
      onDeleted?.(id);
    } catch {
      setError('تعذّر الحذف. حاول مرة أخرى.');
    } finally {
      setDeletingId(null);
    }
  };

  const hasActions = Boolean(editPath || deleteEndpoint || viewPath);

  return (
    <div className="space-y-4">
      {searchable && (
        <div className="relative max-w-md">
          {/* end-3, not right-3 — flips correctly under dir="ltr". */}
          <Search
            className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-[var(--admin-text-muted)]"
            size={18}
            aria-hidden="true"
          />
          <input
            type="search"
            placeholder="بحث..."
            aria-label="بحث"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="admin-input pe-10"
            data-test-id="data-table-search"
          />
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-[var(--admin-danger)]">
          {error}
        </p>
      )}

      <div className="admin-card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full" data-test-id="data-table">
            <thead>
              <tr className="border-b border-[var(--admin-line)] bg-[var(--admin-elevated)]">
                {columns.map((col) => {
                  const isSortable = Boolean(col.sortable && sortable);
                  return (
                    <th
                      key={String(col.key)}
                      scope="col"
                      className="px-4 py-3 text-start text-sm font-medium text-[var(--admin-text-secondary)]"
                      style={{ width: col.width }}
                      aria-sort={
                        sortField === col.key
                          ? sortDirection === 'asc'
                            ? 'ascending'
                            : 'descending'
                          : undefined
                      }
                    >
                      {isSortable ? (
                        <button
                          type="button"
                          onClick={() => toggleSort(String(col.key))}
                          className="flex items-center gap-2 hover:text-[var(--admin-text)]"
                          data-test-id={`data-table-sort-${String(col.key)}`}
                        >
                          {col.header}
                          {sortField === col.key && (
                            <ArrowUpDown
                              size={14}
                              aria-hidden="true"
                              className={sortDirection === 'asc' ? 'rotate-180' : ''}
                            />
                          )}
                        </button>
                      ) : (
                        col.header
                      )}
                    </th>
                  );
                })}
                {hasActions && (
                  <th scope="col" className="px-4 py-3 w-10">
                    إجراءات
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {processedData.length === 0 && (
                <tr>
                  <td
                    colSpan={columns.length + (hasActions ? 1 : 0)}
                    className="px-4 py-10 text-center text-sm text-[var(--admin-text-muted)]"
                  >
                    {emptyMessage}
                  </td>
                </tr>
              )}

              {processedData.map((row, idx) => {
                const id = String(row[keyField]);
                return (
                  <tr
                    key={id}
                    className={cn(
                      'border-b border-[var(--admin-line)] last:border-0 hover:bg-white/5 transition-colors',
                      idx % 2 === 0 ? 'bg-transparent' : 'bg-white/[0.02]'
                    )}
                    data-test-id={`data-table-row-${id}`}
                  >
                    {columns.map((col) => (
                      <td key={String(col.key)} className="px-4 py-3 text-sm">
                        {col.render
                          ? col.render(row)
                          : String(row[col.key as keyof T] ?? '—')}
                      </td>
                    ))}

                    {hasActions && (
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          {viewPath && (
                            <Link
                              href={`${viewPath}/${id}`}
                              aria-label="عرض"
                              className="inline-block rounded p-1.5 hover:bg-white/5"
                              data-test-id={`data-table-view-${id}`}
                            >
                              <Eye size={16} className="text-[var(--admin-text-muted)]" />
                            </Link>
                          )}
                          {editPath && (
                            <Link
                              href={`${editPath}/${id}/edit`}
                              aria-label="تعديل"
                              className="inline-block rounded p-1.5 hover:bg-white/5"
                              data-test-id={`data-table-edit-${id}`}
                            >
                              <Edit size={16} className="text-[var(--admin-primary)]" />
                            </Link>
                          )}
                          {deleteEndpoint && (
                            <button
                              type="button"
                              onClick={() => handleDelete(id)}
                              disabled={deletingId === id}
                              aria-label="حذف"
                              className="rounded p-1.5 hover:bg-white/5 disabled:opacity-40"
                              data-test-id={`data-table-delete-${id}`}
                            >
                              {deletingId === id ? (
                                <Loader2 size={16} className="animate-spin text-red-400" />
                              ) : (
                                <Trash2 size={16} className="text-red-400" />
                              )}
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
