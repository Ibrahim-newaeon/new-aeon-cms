// components/admin/brands-manager.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, Pencil, X, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MediaField } from './media-field';
import { slugify } from '@/lib/taxonomy-schema';
import { useT } from './i18n-provider';

export interface BrandRow {
  id: string;
  slug: string;
  name: string;
  logoUrl: string | null;
  isActive: boolean;
  sortOrder: number;
  productCount: number;
}

type Draft = Omit<BrandRow, 'id' | 'productCount'>;

const emptyDraft = (): Draft => ({
  slug: '',
  name: '',
  logoUrl: null,
  isActive: true,
  sortOrder: 0,
});

export function BrandsManager({ initial }: { initial: BrandRow[] }) {
  const t = useT();
  const router = useRouter();
  const [rows, setRows] = useState(initial);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        editingId ? `/api/commerce/brands/${editingId}` : '/api/commerce/brands',
        {
          method: editingId ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ ...draft, logoUrl: draft.logoUrl || undefined }),
        }
      );
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        throw new Error(data?.error?.issues?.[0]?.message ?? data?.error?.message ?? t('common.saveFailed'));
      }
      setCreating(false);
      setEditingId(null);
      setDraft(emptyDraft());
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.saveFailed'));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (row: BrandRow) => {
    if (!window.confirm(t('brands.deleteConfirm', { name: row.name }))) return;
    setError(null);
    const res = await fetch(`/api/commerce/brands/${row.id}`, {
      method: 'DELETE',
      credentials: 'same-origin',
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.success) {
      setError(data?.error?.message ?? t('common.deleteFailed'));
      return;
    }
    setRows((p) => p.filter((r) => r.id !== row.id));
  };

  const editorOpen = creating || editingId !== null;

  return (
    <div className="space-y-5" data-test-id="brands-manager">
      {!editorOpen && (
        <button
          type="button"
          onClick={() => {
            setDraft(emptyDraft());
            setCreating(true);
            setError(null);
          }}
          className="admin-btn"
          data-test-id="brand-new"
        >
          <Plus size={16} aria-hidden="true" />
          {t('brands.new')}
        </button>
      )}

      {editorOpen && (
        <div className="admin-card space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-medium">{editingId ? t('brands.edit') : t('brands.new')}</h2>
            <button
              type="button"
              onClick={() => {
                setCreating(false);
                setEditingId(null);
              }}
              aria-label={t('common.close')}
              className="rounded p-1.5 hover:bg-white/5"
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs text-[var(--admin-text-secondary)]">{t('common.name')}</span>
              <input
                type="text"
                className="admin-input"
                value={draft.name}
                onChange={(e) => {
                  const name = e.target.value;
                  // Auto-derive the slug only while it is still empty.
                  setDraft((d) => ({ ...d, name, slug: d.slug || slugify(name) }));
                }}
                data-test-id="brand-name"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-xs text-[var(--admin-text-secondary)]">{t('common.slugField')}</span>
              <input
                type="text"
                dir="ltr"
                className="admin-input text-start"
                value={draft.slug}
                onChange={(e) => setDraft((d) => ({ ...d, slug: e.target.value }))}
                placeholder="brand-slug"
                data-test-id="brand-slug"
              />
            </label>

            <div className="sm:col-span-2">
              <MediaField
                label={t('brands.logo')}
                value={draft.logoUrl ?? ''}
                onChange={(logoUrl) => setDraft((d) => ({ ...d, logoUrl: logoUrl || null }))}
                testId="brand-logo"
              />
            </div>

            <label className="block">
              <span className="mb-1 block text-xs text-[var(--admin-text-secondary)]">{t('common.order')}</span>
              <input
                type="number"
                dir="ltr"
                className="admin-input text-start"
                value={draft.sortOrder}
                onChange={(e) => setDraft((d) => ({ ...d, sortOrder: Number(e.target.value) || 0 }))}
              />
            </label>

            <label className="flex items-end gap-2 pb-2 text-sm">
              <input
                type="checkbox"
                checked={draft.isActive}
                onChange={(e) => setDraft((d) => ({ ...d, isActive: e.target.checked }))}
                data-test-id="brand-active"
              />
              {t('common.enabledF')}
            </label>
          </div>

          {error && (
            <p role="alert" className="text-sm text-[var(--admin-danger)]">
              {error}
            </p>
          )}

          <button type="button" onClick={() => void submit()} disabled={busy} className="admin-btn" data-test-id="brand-save">
            {busy && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
            {t('common.save')}
          </button>
        </div>
      )}

      {rows.length === 0 ? (
        <p className="admin-card py-12 text-center text-sm text-[var(--admin-text-muted)]">
          {t('brands.empty')}
        </p>
      ) : (
        <ul className="admin-card divide-y divide-[var(--admin-line)] p-0">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center gap-3 p-4" data-test-id={`brand-${row.id}`}>
              {row.logoUrl ? (
                <img
                  src={row.logoUrl}
                  alt=""
                  className="h-8 w-8 rounded border border-[var(--admin-line)] bg-[var(--admin-bg)] object-contain p-0.5"
                />
              ) : (
                <span className="flex h-8 w-8 items-center justify-center rounded bg-[var(--admin-accent-muted)] text-xs text-[var(--admin-accent-soft)]">
                  {row.name.trim().charAt(0)}
                </span>
              )}

              <span className="flex-1 text-sm font-medium">{row.name}</span>
              <span className="flex-1 text-sm text-[var(--admin-text-muted)]" dir="ltr">
                {row.slug}
              </span>

              {/* Shown so the 409 on delete is predictable rather than a surprise. */}
              <span
                className="rounded-full bg-[var(--admin-accent-muted)] px-2 py-0.5 text-[11px] text-[var(--admin-accent-soft)]"
                dir="ltr"
                title={t('brands.productCount')}
              >
                {row.productCount}
              </span>

              {!row.isActive && (
                <span className="rounded-full bg-white/5 px-2 py-0.5 text-[11px] text-[var(--admin-text-muted)]">
                  {t('common.disabledF')}
                </span>
              )}

              <button
                type="button"
                onClick={() => {
                  const { id, productCount, ...rest } = row;
                  void id;
                  void productCount;
                  setDraft(rest);
                  setEditingId(row.id);
                  setCreating(false);
                  setError(null);
                }}
                aria-label={t('common.editItem', { name: row.name })}
                className="rounded p-2 text-[var(--admin-text-secondary)] hover:bg-white/5"
              >
                <Pencil size={16} aria-hidden="true" />
              </button>

              <button
                type="button"
                onClick={() => void remove(row)}
                disabled={row.productCount > 0}
                title={row.productCount > 0 ? t('brands.hasProducts') : t('common.delete')}
                aria-label={t('common.deleteItem', { name: row.name })}
                className={cn(
                  'rounded p-2 text-[var(--admin-danger)] hover:bg-red-500/10',
                  row.productCount > 0 && 'opacity-30'
                )}
                data-test-id={`brand-delete-${row.id}`}
              >
                <Trash2 size={16} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
