'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, Pencil, X, Loader2, Package } from 'lucide-react';
import { formatPrice, toMajorUnits, toMinorUnits } from '@/lib/money';
import { slugify } from '@/lib/taxonomy-schema';
import { useT, useAdminI18n } from './i18n-provider';

export interface BundleItemRow {
  variantId: string;
  qty: number;
}

export interface BundleRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  price: number;
  isActive: boolean;
  items: BundleItemRow[];
  /** What the components cost separately, for showing the saving. */
  partsTotal: number;
}

export interface VariantOption {
  id: string;
  label: string;
  price: number;
}

const emptyDraft = () => ({
  slug: '',
  name: '',
  description: '',
  price: 0,
  isActive: true,
  items: [] as BundleItemRow[],
});

/**
 * Bundles: a fixed price for a set of variants.
 *
 * The price is a TOTAL, not a percentage off. A computed discount means a later
 * price change to any component silently changes what the bundle costs, and the
 * shop finds out from a customer.
 */
export function BundlesManager({
  initial,
  variants,
  currency,
}: {
  initial: BundleRow[];
  variants: VariantOption[];
  currency: string;
}) {
  const router = useRouter();
  const t = useT();
  const { locale } = useAdminI18n();

  const [rows, setRows] = useState(initial);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState(emptyDraft());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = creating || editingId !== null;

  const partsTotal = draft.items.reduce((sum, item) => {
    const variant = variants.find((v) => v.id === item.variantId);
    return sum + (variant?.price ?? 0) * item.qty;
  }, 0);

  function startCreate() {
    setDraft(emptyDraft());
    setCreating(true);
    setEditingId(null);
    setError(null);
  }

  function startEdit(row: BundleRow) {
    setDraft({
      slug: row.slug,
      name: row.name,
      description: row.description ?? '',
      price: row.price,
      isActive: row.isActive,
      items: row.items,
    });
    setEditingId(row.id);
    setCreating(false);
    setError(null);
  }

  function reset() {
    setCreating(false);
    setEditingId(null);
    setError(null);
  }

  async function save() {
    setBusy(true);
    setError(null);

    try {
      const url = editingId ? `/api/commerce/bundles/${editingId}` : '/api/commerce/bundles';
      const res = await fetch(url, {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ ...draft, sortOrder: 0 }),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.success) {
        throw new Error(data?.error?.message ?? t('common.saveFailed'));
      }

      reset();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.saveFailed'));
    } finally {
      setBusy(false);
    }
  }

  async function remove(row: BundleRow) {
    if (!window.confirm(t('bundles.deleteConfirm', { name: row.name }))) return;

    const res = await fetch(`/api/commerce/bundles/${row.id}`, {
      method: 'DELETE',
      credentials: 'same-origin',
    });
    if (res.ok) {
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      router.refresh();
    }
  }

  return (
    <div className="space-y-4" data-test-id="bundles-manager">
      {!open && (
        <button type="button" onClick={startCreate} className="admin-btn" data-test-id="bundle-new">
          <Plus size={16} aria-hidden="true" />
          {t('bundles.new')}
        </button>
      )}

      {error && (
        <p role="alert" className="admin-card border-[var(--admin-danger)] text-sm text-[var(--admin-danger)]">
          {error}
        </p>
      )}

      {open && (
        <div className="admin-card space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-medium">{editingId ? t('bundles.edit') : t('bundles.new')}</h2>
            <button type="button" onClick={reset} aria-label={t('common.close')} className="rounded p-1.5 hover:bg-white/5">
              <X size={16} aria-hidden="true" />
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label>
              <span className="mb-1 block text-xs text-[var(--admin-text-secondary)]">{t('common.name')}</span>
              <input
                className="admin-input"
                value={draft.name}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    name: e.target.value,
                    slug: d.slug || slugify(e.target.value),
                  }))
                }
                data-test-id="bundle-name"
              />
            </label>

            <label>
              <span className="mb-1 block text-xs text-[var(--admin-text-secondary)]">{t('common.slugField')}</span>
              <input
                className="admin-input text-start"
                dir="ltr"
                value={draft.slug}
                onChange={(e) => setDraft((d) => ({ ...d, slug: e.target.value }))}
                data-test-id="bundle-slug"
              />
            </label>

            <label className="sm:col-span-2">
              <span className="mb-1 block text-xs text-[var(--admin-text-secondary)]">
                {t('bundles.price', { currency })}
              </span>
              <input
                type="number"
                step="any"
                min={0}
                className="admin-input text-start"
                dir="ltr"
                value={toMajorUnits(draft.price, currency)}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, price: toMinorUnits(Number(e.target.value), currency) }))
                }
                data-test-id="bundle-price"
              />
            </label>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-xs text-[var(--admin-text-secondary)]">{t('bundles.items')}</legend>

            {draft.items.map((item, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <select
                  className="admin-input flex-1"
                  value={item.variantId}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      items: d.items.map((x, j) => (j === i ? { ...x, variantId: e.target.value } : x)),
                    }))
                  }
                  aria-label={t('bundles.component', { n: i + 1 })}
                  data-test-id={`bundle-item-${i}`}
                >
                  <option value="">—</option>
                  {variants.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.label}
                    </option>
                  ))}
                </select>

                <input
                  type="number"
                  min={1}
                  className="admin-input w-20 text-start"
                  dir="ltr"
                  value={item.qty}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      items: d.items.map((x, j) =>
                        j === i ? { ...x, qty: Math.max(1, Number(e.target.value)) } : x
                      ),
                    }))
                  }
                  aria-label={t('bundles.qtyFor', { n: i + 1 })}
                />

                <button
                  type="button"
                  onClick={() => setDraft((d) => ({ ...d, items: d.items.filter((_, j) => j !== i) }))}
                  aria-label={t('bundles.removeComponent', { n: i + 1 })}
                  className="rounded p-2 text-[var(--admin-danger)] hover:bg-red-500/10"
                >
                  <Trash2 size={14} aria-hidden="true" />
                </button>
              </div>
            ))}

            <button
              type="button"
              onClick={() => setDraft((d) => ({ ...d, items: [...d.items, { variantId: '', qty: 1 }] }))}
              className="admin-btn-ghost text-xs"
              data-test-id="bundle-add-item"
            >
              <Plus size={14} aria-hidden="true" />
              {t('bundles.addComponent')}
            </button>
          </fieldset>

          {partsTotal > 0 && (
            <p className="text-xs text-[var(--admin-text-muted)]" data-test-id="bundle-saving-preview">
              {t('bundles.partsTotal')}: <span dir="ltr">{formatPrice(partsTotal, currency, locale)}</span>
              {draft.price > 0 && draft.price < partsTotal && (
                <>
                  {' · '}
                  {t('bundles.saving')}:{' '}
                  <span dir="ltr" className="text-[var(--admin-success)]">
                    {formatPrice(partsTotal - draft.price, currency, locale)}
                  </span>
                </>
              )}
              {draft.price > partsTotal && (
                <span className="ms-2 text-[var(--admin-warning)]">{t('bundles.pricedAbove')}</span>
              )}
            </p>
          )}

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={draft.isActive}
              onChange={(e) => setDraft((d) => ({ ...d, isActive: e.target.checked }))}
              data-test-id="bundle-active"
            />
            {t('common.enabled')}
          </label>

          <button type="button" disabled={busy} onClick={() => void save()} className="admin-btn" data-test-id="bundle-save">
            {busy && <Loader2 size={15} className="animate-spin" aria-hidden="true" />}
            {t('common.save')}
          </button>
        </div>
      )}

      {rows.length === 0 ? (
        <p className="admin-card py-16 text-center text-sm text-[var(--admin-text-muted)]">
          {t('bundles.empty')}
        </p>
      ) : (
        <ul className="admin-card divide-y divide-[var(--admin-line)] p-0">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center gap-3 p-4" data-test-id={`bundle-${row.id}`}>
              <Package size={16} aria-hidden="true" className="text-[var(--admin-text-muted)]" />

              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-[var(--admin-text)]">{row.name}</p>
                <p className="text-xs text-[var(--admin-text-muted)]">
                  <span dir="ltr">{row.slug}</span> · {row.items.length} {t('bundles.itemsShort')}
                  {!row.isActive && <span className="ms-2">{t('common.disabled')}</span>}
                </p>
              </div>

              <span className="text-sm text-[var(--admin-text)]" dir="ltr">
                {formatPrice(row.price, currency, locale)}
              </span>

              {row.partsTotal > row.price && (
                <span className="text-xs text-[var(--admin-success)]" dir="ltr">
                  −{formatPrice(row.partsTotal - row.price, currency, locale)}
                </span>
              )}

              <button
                type="button"
                onClick={() => startEdit(row)}
                aria-label={t('common.editItem', { name: row.name })}
                className="rounded p-2 text-[var(--admin-text-secondary)] hover:bg-white/5"
              >
                <Pencil size={15} aria-hidden="true" />
              </button>

              <button
                type="button"
                onClick={() => void remove(row)}
                aria-label={t('common.deleteItem', { name: row.name })}
                className="rounded p-2 text-[var(--admin-danger)] hover:bg-red-500/10"
              >
                <Trash2 size={15} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
