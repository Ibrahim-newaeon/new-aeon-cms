// components/admin/categories-manager.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, Pencil, X, Loader2, CornerDownLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { slugify } from '@/lib/taxonomy-schema';
import { useT } from './i18n-provider';

export interface CategoryRow {
  id: string;
  slug: string;
  parentId: string | null;
  sortOrder: number;
  isActive: boolean;
  nameAr: string;
  nameEn: string;
  descriptionAr: string;
  descriptionEn: string;
}

type Draft = Omit<CategoryRow, 'id'>;

const emptyDraft = (): Draft => ({
  slug: '',
  parentId: null,
  sortOrder: 0,
  isActive: true,
  nameAr: '',
  nameEn: '',
  descriptionAr: '',
  descriptionEn: '',
});

function toPayload(d: Draft) {
  // Only send locales that actually have a name; an empty row would render as a
  // blank category on the public site.
  const translations = [
    d.nameAr.trim() ? { locale: 'ar' as const, name: d.nameAr, description: d.descriptionAr || undefined } : null,
    d.nameEn.trim() ? { locale: 'en' as const, name: d.nameEn, description: d.descriptionEn || undefined } : null,
  ].filter(Boolean);

  return {
    slug: d.slug,
    parentId: d.parentId,
    sortOrder: d.sortOrder,
    isActive: d.isActive,
    translations,
  };
}

export function CategoriesManager({ initial }: { initial: CategoryRow[] }) {
  const t = useT();
  const router = useRouter();
  const [rows, setRows] = useState(initial);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Ordered so children render directly under their parent.
  const tree = rows
    .filter((r) => !r.parentId)
    .flatMap((parent) => [parent, ...rows.filter((c) => c.parentId === parent.id)]);
  const orphans = rows.filter((r) => r.parentId && !rows.some((p) => p.id === r.parentId));

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const url = editingId ? `/api/categories/${editingId}` : '/api/categories';
      const res = await fetch(url, {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(toPayload(draft)),
      });
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

  const remove = async (row: CategoryRow) => {
    if (!window.confirm(t('categories.deleteConfirm'))) return;
    const res = await fetch(`/api/categories/${row.id}`, {
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

  const startEdit = (row: CategoryRow) => {
    const { id, ...rest } = row;
    void id;
    setDraft(rest);
    setEditingId(row.id);
    setCreating(false);
    setError(null);
  };

  const editorOpen = creating || editingId !== null;

  return (
    <div className="space-y-5" data-test-id="categories-manager">
      {!editorOpen && (
        <button
          type="button"
          onClick={() => {
            setDraft(emptyDraft());
            setCreating(true);
            setError(null);
          }}
          className="admin-btn"
          data-test-id="category-new"
        >
          <Plus size={16} aria-hidden="true" />
          {t('categories.new')}
        </button>
      )}

      {editorOpen && (
        <div className="admin-card space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-medium">{editingId ? t('categories.edit') : t('categories.new')}</h2>
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
            <Field label={t('categories.nameAr')}>
              <input
                className="admin-input"
                value={draft.nameAr}
                onChange={(e) => {
                  const nameAr = e.target.value;
                  setDraft((d) => ({ ...d, nameAr, slug: d.slug || slugify(nameAr) }));
                }}
                data-test-id="category-name-ar"
              />
            </Field>

            <Field label="Name (English)">
              <input
                className="admin-input text-start"
                dir="ltr"
                value={draft.nameEn}
                onChange={(e) => {
                  const nameEn = e.target.value;
                  setDraft((d) => ({ ...d, nameEn, slug: d.slug || slugify(nameEn) }));
                }}
                data-test-id="category-name-en"
              />
            </Field>

            <Field label={t('common.slugField')} hint={t('common.slugHint')}>
              <input
                className="admin-input text-start"
                dir="ltr"
                value={draft.slug}
                onChange={(e) => setDraft((d) => ({ ...d, slug: e.target.value }))}
                placeholder="category-slug"
                data-test-id="category-slug"
              />
            </Field>

            <Field label={t('categories.parent')}>
              <select
                className="admin-input"
                value={draft.parentId ?? ''}
                onChange={(e) => setDraft((d) => ({ ...d, parentId: e.target.value || null }))}
                data-test-id="category-parent"
              >
                <option value="">{t('common.none')}</option>
                {rows
                  // One level only, and never itself: both would create a cycle.
                  .filter((r) => r.id !== editingId && !r.parentId)
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.nameAr || r.slug}
                    </option>
                  ))}
              </select>
            </Field>

            <Field label={t('common.order')}>
              <input
                type="number"
                dir="ltr"
                className="admin-input text-start"
                value={draft.sortOrder}
                onChange={(e) => setDraft((d) => ({ ...d, sortOrder: Number(e.target.value) || 0 }))}
              />
            </Field>

            <label className="flex items-end gap-2 pb-2 text-sm">
              <input
                type="checkbox"
                checked={draft.isActive}
                onChange={(e) => setDraft((d) => ({ ...d, isActive: e.target.checked }))}
                data-test-id="category-active"
              />
              {t('common.enabled')}
            </label>
          </div>

          {error && (
            <p role="alert" className="text-sm text-[var(--admin-danger)]">
              {error}
            </p>
          )}

          <button type="button" onClick={() => void submit()} disabled={busy} className="admin-btn" data-test-id="category-save">
            {busy && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
            {t('common.save')}
          </button>
        </div>
      )}

      {rows.length === 0 ? (
        <p className="admin-card py-12 text-center text-sm text-[var(--admin-text-muted)]">
          {t('categories.empty')}
        </p>
      ) : (
        <ul className="admin-card divide-y divide-[var(--admin-line)] p-0">
          {[...tree, ...orphans].map((row) => (
            <li
              key={row.id}
              className={cn('flex flex-wrap items-center gap-3 p-4', row.parentId && 'ps-10')}
              data-test-id={`category-${row.id}`}
            >
              {row.parentId && (
                <CornerDownLeft size={14} aria-hidden="true" className="text-[var(--admin-text-muted)]" />
              )}

              <span className="flex-1 text-sm font-medium">{row.nameAr || row.slug}</span>
              <span className="flex-1 text-sm text-[var(--admin-text-muted)]" dir="ltr">
                {row.nameEn || '—'}
              </span>
              <span className="text-xs text-[var(--admin-text-muted)]" dir="ltr">
                {row.slug}
              </span>

              {!row.isActive && (
                <span className="rounded-full bg-[var(--admin-none-bg,rgba(255,255,255,.08))] px-2 py-0.5 text-[11px] text-[var(--admin-text-muted)]">
                  {t('common.disabled')}
                </span>
              )}

              <button type="button" onClick={() => startEdit(row)} aria-label={t('common.editItem', { name: row.slug })} className="rounded p-2 text-[var(--admin-text-secondary)] hover:bg-white/5">
                <Pencil size={16} aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => void remove(row)}
                aria-label={t('common.deleteItem', { name: row.slug })}
                className="rounded p-2 text-[var(--admin-danger)] hover:bg-red-500/10"
                data-test-id={`category-delete-${row.id}`}
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

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-[var(--admin-text-secondary)]">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-[var(--admin-text-muted)]">{hint}</span>}
    </label>
  );
}
