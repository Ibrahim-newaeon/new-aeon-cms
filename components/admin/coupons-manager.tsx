// components/admin/coupons-manager.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, Pencil, X, Loader2, Ticket } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toMajorUnits, toMinorUnits, formatPrice } from '@/lib/money';
import { useT, useAdminI18n } from './i18n-provider';
import type { Translator } from '@/lib/admin-i18n';

export interface CouponRow {
  id: string;
  code: string;
  type: 'percent' | 'fixed';
  value: number;
  minSubtotal: number;
  usageLimit: number | null;
  usedCount: number;
  /** ISO strings, so the row can cross the server/client boundary. */
  startsAt: string | null;
  endsAt: string | null;
  isActive: boolean;
}

type Draft = Omit<CouponRow, 'id' | 'usedCount'>;

const emptyDraft = (): Draft => ({
  code: '',
  type: 'percent',
  value: 10,
  minSubtotal: 0,
  usageLimit: null,
  startsAt: null,
  endsAt: null,
  isActive: true,
});

/** `datetime-local` wants "YYYY-MM-DDTHH:mm" in LOCAL time, not a UTC ISO string. */
function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * Why a coupon is not currently redeemable, or null when it is.
 *
 * Takes the translator rather than calling the hook: this is a plain module
 * function, and a hook cannot be called outside a component.
 */
function dormantReason(row: CouponRow, t: Translator): string | null {
  if (!row.isActive) return t('common.disabled');
  const now = Date.now();
  if (row.startsAt && new Date(row.startsAt).getTime() > now) return t('coupon.notStarted');
  if (row.endsAt && new Date(row.endsAt).getTime() < now) return t('coupon.expired');
  if (row.usageLimit !== null && row.usedCount >= row.usageLimit) return t('coupon.exhausted');
  return null;
}

export function CouponsManager({
  initial,
  currency,
}: {
  initial: CouponRow[];
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

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        editingId ? `/api/commerce/coupons/${editingId}` : '/api/commerce/coupons',
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

  const remove = async (row: CouponRow) => {
    if (!window.confirm(t('coupon.deleteConfirm', { code: row.code }))) return;
    setError(null);
    const res = await fetch(`/api/commerce/coupons/${row.id}`, {
      method: 'DELETE',
      credentials: 'same-origin',
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.success) {
      // A redeemed coupon is deactivated rather than deleted, so refresh to
      // show the new state alongside the explanation.
      setError(data?.error?.message ?? t('common.deleteFailed'));
      router.refresh();
      return;
    }
    setRows((p) => p.filter((r) => r.id !== row.id));
  };

  const editorOpen = creating || editingId !== null;

  return (
    <div className="space-y-5" data-test-id="coupons-manager">
      {!editorOpen && (
        <button
          type="button"
          onClick={() => {
            setDraft(emptyDraft());
            setCreating(true);
            setError(null);
          }}
          className="admin-btn"
          data-test-id="coupon-new"
        >
          <Plus size={16} aria-hidden="true" />
          {t('coupon.new')}
        </button>
      )}

      {editorOpen && (
        <div className="admin-card space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-medium">{editingId ? t('coupon.edit') : t('coupon.new')}</h2>
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
              <span className="mb-1 block text-xs text-[var(--admin-text-secondary)]">{t('coupon.code')}</span>
              <input
                type="text"
                dir="ltr"
                className="admin-input text-start uppercase"
                value={draft.code}
                // Uppercased on the way in, because checkout uppercases what it
                // receives before matching.
                onChange={(e) => setDraft((d) => ({ ...d, code: e.target.value.toUpperCase() }))}
                placeholder="SAVE10"
                data-test-id="coupon-code"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-xs text-[var(--admin-text-secondary)]">{t('coupon.type')}</span>
              <select
                className="admin-input"
                value={draft.type}
                onChange={(e) => {
                  const type = e.target.value as 'percent' | 'fixed';
                  // The unit changes meaning entirely, so carrying the old
                  // number across would turn "10%" into 10 fils.
                  setDraft((d) => ({ ...d, type, value: type === 'percent' ? 10 : 0 }));
                }}
                data-test-id="coupon-type"
              >
                <option value="percent">{t('coupon.percent')}</option>
                <option value="fixed">{t('coupon.fixed', { currency })}</option>
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-xs text-[var(--admin-text-secondary)]">
                {draft.type === 'percent' ? t('coupon.percentValue') : t('coupon.fixedValue', { currency })}
              </span>
              <input
                type="number"
                min={draft.type === 'percent' ? 1 : 0}
                max={draft.type === 'percent' ? 100 : undefined}
                step={draft.type === 'percent' ? 1 : 0.001}
                dir="ltr"
                className="admin-input text-start"
                value={
                  draft.type === 'percent' ? draft.value : toMajorUnits(draft.value, currency)
                }
                onChange={(e) => {
                  const n = Number(e.target.value) || 0;
                  setDraft((d) => ({
                    ...d,
                    value: d.type === 'percent' ? Math.round(n) : toMinorUnits(n, currency),
                  }));
                }}
                data-test-id="coupon-value"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-xs text-[var(--admin-text-secondary)]">
                {t('coupon.minSubtotal', { currency })}
              </span>
              <input
                type="number"
                min="0"
                step="0.001"
                dir="ltr"
                className="admin-input text-start"
                value={toMajorUnits(draft.minSubtotal, currency)}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    minSubtotal: toMinorUnits(Number(e.target.value) || 0, currency),
                  }))
                }
                data-test-id="coupon-min-subtotal"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-xs text-[var(--admin-text-secondary)]">
                {t('coupon.usageLimit')}
              </span>
              <input
                type="number"
                min="1"
                dir="ltr"
                className="admin-input text-start"
                value={draft.usageLimit ?? ''}
                // Empty means unlimited — not zero, which no one could redeem.
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    usageLimit: e.target.value === '' ? null : Number(e.target.value) || 1,
                  }))
                }
                placeholder={t('coupon.noLimit')}
                data-test-id="coupon-usage-limit"
              />
            </label>

            <label className="flex items-end gap-2 pb-2 text-sm">
              <input
                type="checkbox"
                checked={draft.isActive}
                onChange={(e) => setDraft((d) => ({ ...d, isActive: e.target.checked }))}
                data-test-id="coupon-active"
              />
              {t('common.enabled')}
            </label>

            <label className="block">
              <span className="mb-1 block text-xs text-[var(--admin-text-secondary)]">
                {t('coupon.startsAt')}
              </span>
              <input
                type="datetime-local"
                dir="ltr"
                className="admin-input text-start"
                value={toLocalInput(draft.startsAt)}
                onChange={(e) => setDraft((d) => ({ ...d, startsAt: fromLocalInput(e.target.value) }))}
                data-test-id="coupon-starts-at"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-xs text-[var(--admin-text-secondary)]">
                {t('coupon.endsAt')}
              </span>
              <input
                type="datetime-local"
                dir="ltr"
                className="admin-input text-start"
                value={toLocalInput(draft.endsAt)}
                onChange={(e) => setDraft((d) => ({ ...d, endsAt: fromLocalInput(e.target.value) }))}
                data-test-id="coupon-ends-at"
              />
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
            data-test-id="coupon-save"
          >
            {busy && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
            {t('common.save')}
          </button>
        </div>
      )}

      {rows.length === 0 ? (
        <p className="admin-card py-12 text-center text-sm text-[var(--admin-text-muted)]">
          {t('coupon.empty')}
        </p>
      ) : (
        <ul className="admin-card divide-y divide-[var(--admin-line)] p-0">
          {rows.map((row) => {
            const dormant = dormantReason(row, t);
            return (
              <li
                key={row.id}
                className="flex flex-wrap items-center gap-3 p-4"
                data-test-id={`coupon-${row.id}`}
              >
                <span className="flex h-8 w-8 items-center justify-center rounded bg-[var(--admin-accent-muted)] text-[var(--admin-accent-soft)]">
                  <Ticket size={16} aria-hidden="true" />
                </span>

                <span className="min-w-[7rem] text-sm font-medium" dir="ltr">
                  {row.code}
                </span>

                <span className="text-sm" dir="ltr">
                  {row.type === 'percent'
                    ? `${row.value}%`
                    : formatPrice(row.value, currency, locale)}
                </span>

                {row.minSubtotal > 0 && (
                  <span className="text-xs text-[var(--admin-text-muted)]">
                    {t('coupon.over')} <span dir="ltr">{formatPrice(row.minSubtotal, currency, locale)}</span>
                  </span>
                )}

                {/* Redemptions so far, and the ceiling when there is one. */}
                <span
                  className="rounded-full bg-[var(--admin-accent-muted)] px-2 py-0.5 text-[11px] text-[var(--admin-accent-soft)]"
                  dir="ltr"
                  title={t('coupon.timesUsed')}
                >
                  {row.usedCount}
                  {row.usageLimit !== null ? ` / ${row.usageLimit}` : ''}
                </span>

                {/* One badge covering every reason a code is not redeemable —
                    "active" alone hides an expiry or an exhausted limit. */}
                {dormant && (
                  <span className="rounded-full bg-white/5 px-2 py-0.5 text-[11px] text-[var(--admin-text-muted)]">
                    {dormant}
                  </span>
                )}

                <span className="flex-1" />

                <button
                  type="button"
                  onClick={() => {
                    const { id, usedCount, ...rest } = row;
                    void id;
                    void usedCount;
                    setDraft(rest);
                    setEditingId(row.id);
                    setCreating(false);
                    setError(null);
                  }}
                  aria-label={t('common.editItem', { name: row.code })}
                  className="rounded p-2 text-[var(--admin-text-secondary)] hover:bg-white/5"
                >
                  <Pencil size={16} aria-hidden="true" />
                </button>

                <button
                  type="button"
                  onClick={() => void remove(row)}
                  disabled={row.usedCount > 0}
                  title={row.usedCount > 0 ? t('coupon.inUse') : t('common.delete')}
                  aria-label={t('common.deleteItem', { name: row.code })}
                  className={cn(
                    'rounded p-2 text-[var(--admin-danger)] hover:bg-red-500/10',
                    row.usedCount > 0 && 'opacity-30'
                  )}
                  data-test-id={`coupon-delete-${row.id}`}
                >
                  <Trash2 size={16} aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
