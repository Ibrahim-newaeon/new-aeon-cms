// components/admin/shipping-zones-manager.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, Pencil, X, Loader2, Truck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { GOVERNORATES } from '@/lib/commerce/phone';
import { toMajorUnits, toMinorUnits, formatPrice } from '@/lib/money';
import { useT, useAdminI18n } from './i18n-provider';

export interface ShippingZoneRow {
  id: string;
  name: string;
  governorates: string[];
  flatRate: number;
  freeOver: number | null;
  etaDays: number;
  isActive: boolean;
  sortOrder: number;
  orderCount: number;
}

type Draft = Omit<ShippingZoneRow, 'id' | 'orderCount'>;

const emptyDraft = (): Draft => ({
  name: '',
  governorates: [],
  flatRate: 0,
  freeOver: null,
  etaDays: 3,
  isActive: true,
  sortOrder: 0,
});

// Takes the locale rather than always reading the Arabic label: this list is
// rendered inside an admin panel that may be in English.
const labelOf = (value: string, locale: 'ar' | 'en') =>
  (locale === 'ar'
    ? GOVERNORATES.find((g) => g.value === value)?.ar
    : GOVERNORATES.find((g) => g.value === value)?.en) ?? value;

export function ShippingZonesManager({
  initial,
  currency,
}: {
  initial: ShippingZoneRow[];
  currency: string;
}) {
  const t = useT();
  const { locale } = useAdminI18n();
  const router = useRouter();
  const [rows, setRows] = useState(initial);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Governorates already live elsewhere. Shown as disabled rather than hidden,
  // so an editor can see WHY one is unavailable instead of wondering where it went.
  const claimedElsewhere = new Map<string, string>();
  for (const row of rows) {
    if (!row.isActive || row.id === editingId) continue;
    for (const g of row.governorates) claimedElsewhere.set(g, row.name);
  }

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        editingId ? `/api/commerce/shipping-zones/${editingId}` : '/api/commerce/shipping-zones',
        {
          method: editingId ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify(draft),
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

  const remove = async (row: ShippingZoneRow) => {
    if (!window.confirm(t('zone.deleteConfirm', { name: row.name }))) return;
    setError(null);
    const res = await fetch(`/api/commerce/shipping-zones/${row.id}`, {
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

  const toggleGovernorate = (value: string) =>
    setDraft((d) => ({
      ...d,
      governorates: d.governorates.includes(value)
        ? d.governorates.filter((g) => g !== value)
        : [...d.governorates, value],
    }));

  const editorOpen = creating || editingId !== null;
  const uncovered = GOVERNORATES.filter(
    (g) => !rows.some((r) => r.isActive && r.governorates.includes(g.value))
  );

  return (
    <div className="space-y-5" data-test-id="zones-manager">
      {/* Checkout REJECTS an address in an uncovered governorate. Surfacing the
          gap here is the difference between a deliberate policy and lost orders. */}
      {uncovered.length > 0 && (
        <p className="admin-card border-amber-500/30 bg-amber-500/5 text-sm text-amber-300">
          {t('zone.uncovered', { list: uncovered.map((g) => (locale === 'ar' ? g.ar : g.en)).join(t('common.listSeparator')) })}
        </p>
      )}

      {!editorOpen && (
        <button
          type="button"
          onClick={() => {
            setDraft(emptyDraft());
            setCreating(true);
            setError(null);
          }}
          className="admin-btn"
          data-test-id="zone-new"
        >
          <Plus size={16} aria-hidden="true" />
          {t('zone.new')}
        </button>
      )}

      {editorOpen && (
        <div className="admin-card space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-medium">{editingId ? t('zone.edit') : t('zone.new')}</h2>
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

          <label className="block">
            <span className="mb-1 block text-xs text-[var(--admin-text-secondary)]">{t('zone.name')}</span>
            <input
              type="text"
              className="admin-input"
              value={draft.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              placeholder={t('zone.namePlaceholder')}
              data-test-id="zone-name"
            />
          </label>

          <fieldset>
            <legend className="mb-2 text-xs text-[var(--admin-text-secondary)]">
              {t('zone.governorates')}
            </legend>
            <div className="flex flex-wrap gap-2">
              {GOVERNORATES.map((g) => {
                const on = draft.governorates.includes(g.value);
                const takenBy = claimedElsewhere.get(g.value);
                return (
                  <button
                    key={g.value}
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    disabled={Boolean(takenBy) && !on}
                    title={takenBy ? t('zone.takenBy', { name: takenBy }) : undefined}
                    onClick={() => toggleGovernorate(g.value)}
                    data-test-id={`zone-gov-${g.value}`}
                    className={cn(
                      'rounded-full border px-3 py-1 text-sm transition-colors',
                      on
                        ? 'border-[var(--admin-accent)] bg-[var(--admin-accent-muted)] text-[var(--admin-accent-soft)]'
                        : 'border-[var(--admin-line)] text-[var(--admin-text-secondary)] hover:bg-white/5',
                      takenBy && !on && 'cursor-not-allowed opacity-30'
                    )}
                  >
                    {g.ar}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block">
              <span className="mb-1 block text-xs text-[var(--admin-text-secondary)]">
                {t('zone.flatRate', { currency })}
              </span>
              <input
                type="number"
                step="0.001"
                min="0"
                dir="ltr"
                className="admin-input text-start"
                value={toMajorUnits(draft.flatRate, currency)}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    flatRate: toMinorUnits(Number(e.target.value) || 0, currency),
                  }))
                }
                data-test-id="zone-flat-rate"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-xs text-[var(--admin-text-secondary)]">
                {t('zone.freeOver', { currency })}
              </span>
              <input
                type="number"
                step="0.001"
                min="0"
                dir="ltr"
                className="admin-input text-start"
                value={draft.freeOver === null ? '' : toMajorUnits(draft.freeOver, currency)}
                // Empty means "never free" — distinct from zero, which would make
                // every order in this zone ship free.
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    freeOver:
                      e.target.value === ''
                        ? null
                        : toMinorUnits(Number(e.target.value) || 0, currency),
                  }))
                }
                placeholder={t('zone.leaveEmpty')}
                data-test-id="zone-free-over"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-xs text-[var(--admin-text-secondary)]">
                {t('zone.deliveryDays')}
              </span>
              <input
                type="number"
                min="0"
                dir="ltr"
                className="admin-input text-start"
                value={draft.etaDays}
                onChange={(e) => setDraft((d) => ({ ...d, etaDays: Number(e.target.value) || 0 }))}
              />
            </label>

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

            <label className="flex items-end gap-2 pb-2 text-sm sm:col-span-2">
              <input
                type="checkbox"
                checked={draft.isActive}
                onChange={(e) => setDraft((d) => ({ ...d, isActive: e.target.checked }))}
                data-test-id="zone-active"
              />
              {t('common.enabledF')}
            </label>
          </div>

          {error && (
            <p role="alert" className="text-sm text-[var(--admin-danger)]">
              {error}
            </p>
          )}

          <button
            type="button"
            onClick={() => void submit()}
            disabled={busy}
            className="admin-btn"
            data-test-id="zone-save"
          >
            {busy && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
            {t('common.save')}
          </button>
        </div>
      )}

      {rows.length === 0 ? (
        <p className="admin-card py-12 text-center text-sm text-[var(--admin-text-muted)]">
          {t('zone.empty')}
        </p>
      ) : (
        <ul className="admin-card divide-y divide-[var(--admin-line)] p-0">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex flex-wrap items-center gap-3 p-4"
              data-test-id={`zone-${row.id}`}
            >
              <span className="flex h-8 w-8 items-center justify-center rounded bg-[var(--admin-accent-muted)] text-[var(--admin-accent-soft)]">
                <Truck size={16} aria-hidden="true" />
              </span>

              <div className="min-w-[10rem] flex-1">
                <p className="text-sm font-medium">{row.name}</p>
                <p className="text-xs text-[var(--admin-text-muted)]">
                  {row.governorates.map((g) => labelOf(g, locale)).join(t('common.listSeparator'))}
                </p>
              </div>

              <span className="text-sm" dir="ltr">
                {formatPrice(row.flatRate, currency, locale)}
              </span>

              <span className="text-xs text-[var(--admin-text-muted)]">
                {row.freeOver === null ? (
                  '—'
                ) : (
                  <>
                    {t('zone.freeOverLabel')} <span dir="ltr">{formatPrice(row.freeOver, currency, locale)}</span>
                  </>
                )}
              </span>

              {!row.isActive && (
                <span className="rounded-full bg-white/5 px-2 py-0.5 text-[11px] text-[var(--admin-text-muted)]">
                  {t('common.disabledF')}
                </span>
              )}

              <button
                type="button"
                onClick={() => {
                  const { id, orderCount, ...rest } = row;
                  void id;
                  void orderCount;
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
                disabled={row.orderCount > 0}
                title={row.orderCount > 0 ? t('zone.hasOrders') : t('common.delete')}
                aria-label={t('common.deleteItem', { name: row.name })}
                className={cn(
                  'rounded p-2 text-[var(--admin-danger)] hover:bg-red-500/10',
                  row.orderCount > 0 && 'opacity-30'
                )}
                data-test-id={`zone-delete-${row.id}`}
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
