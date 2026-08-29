'use client';

import { useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Check, X, Trash2, Star, Loader2 } from 'lucide-react';
import { useT, useAdminI18n } from './i18n-provider';

export interface ReviewRow {
  id: string;
  productName: string;
  customerName: string;
  phone: string;
  rating: number;
  body: string;
  status: 'pending' | 'approved' | 'rejected';
  moderatedBy: string | null;
  createdAt: string | null;
}

const TONE: Record<ReviewRow['status'], string> = {
  pending: 'bg-amber-500/15 text-amber-300',
  approved: 'bg-green-500/20 text-green-400',
  rejected: 'bg-rose-500/15 text-rose-300',
};

/**
 * The moderation queue.
 *
 * Nothing here is publicly visible until it is approved, so this screen is the
 * only thing standing between a spam submission and the shop's own product
 * pages.
 */
export function ReviewsManager({
  rows,
  status,
  canDelete,
}: {
  rows: ReviewRow[];
  status: string;
  canDelete: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const t = useT();
  const { locale } = useAdminI18n();
  const [busy, setBusy] = useState<string | null>(null);

  const label: Record<ReviewRow['status'], string> = {
    pending: t('reviews.pending'),
    approved: t('reviews.approved'),
    rejected: t('reviews.rejected'),
  };

  function filter(next: string) {
    const q = new URLSearchParams(params.toString());
    if (next) q.set('status', next);
    else q.delete('status');
    router.push(`${pathname}?${q.toString()}`);
  }

  async function moderate(id: string, next: 'approved' | 'rejected') {
    setBusy(id);
    try {
      const res = await fetch(`/api/commerce/reviews/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ status: next }),
      });
      if (res.ok) router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: string) {
    if (!window.confirm(t('reviews.deleteConfirm'))) return;
    setBusy(id);
    try {
      const res = await fetch(`/api/commerce/reviews/${id}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      });
      if (res.ok) router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4" data-test-id="reviews-manager">
      <div role="tablist" aria-label={t('reviews.filter')} className="flex flex-wrap gap-1">
        {['pending', 'approved', 'rejected', ''].map((value) => (
          <button
            key={value || 'all'}
            type="button"
            role="tab"
            aria-selected={status === value}
            onClick={() => filter(value)}
            data-test-id={`reviews-tab-${value || 'all'}`}
            className={`rounded-lg px-4 py-2 text-sm ${
              status === value
                ? 'bg-[var(--admin-elevated)] text-[var(--admin-text)]'
                : 'text-[var(--admin-text-secondary)] hover:text-[var(--admin-text)]'
            }`}
          >
            {value ? label[value as ReviewRow['status']] : t('reviews.all')}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="admin-card py-16 text-center text-sm text-[var(--admin-text-muted)]">
          {t('reviews.empty')}
        </p>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => (
            <div key={row.id} className="admin-card space-y-2 py-4" data-test-id={`review-${row.id}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <p className="text-sm font-medium text-[var(--admin-text)]">
                    {row.productName}
                    <span className={`ms-2 rounded-full px-2 py-0.5 text-[10px] ${TONE[row.status]}`}>
                      {label[row.status]}
                    </span>
                  </p>

                  <p className="flex flex-wrap items-center gap-1 text-xs text-[var(--admin-text-muted)]">
                    <span aria-label={t('reviews.ratingOf', { rating: row.rating })} className="flex">
                      {Array.from({ length: 5 }, (_, i) => (
                        <Star
                          key={i}
                          size={12}
                          aria-hidden="true"
                          className={i < row.rating ? 'fill-current text-amber-400' : 'text-gray-600'}
                        />
                      ))}
                    </span>
                    <span>{row.customerName}</span>
                    <span dir="ltr">{row.phone}</span>
                    <span dir="ltr">
                      {row.createdAt
                        ? new Date(row.createdAt).toLocaleDateString(
                            locale === 'ar' ? 'ar-JO' : 'en-GB'
                          )
                        : '—'}
                    </span>
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  {busy === row.id && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}

                  {row.status !== 'approved' && (
                    <button
                      type="button"
                      onClick={() => void moderate(row.id, 'approved')}
                      aria-label={t('reviews.approve')}
                      title={t('reviews.approve')}
                      data-test-id={`review-approve-${row.id}`}
                      className="rounded p-2 text-[var(--admin-success)] hover:bg-white/5"
                    >
                      <Check size={15} aria-hidden="true" />
                    </button>
                  )}

                  {row.status !== 'rejected' && (
                    <button
                      type="button"
                      onClick={() => void moderate(row.id, 'rejected')}
                      aria-label={t('reviews.reject')}
                      title={t('reviews.reject')}
                      data-test-id={`review-reject-${row.id}`}
                      className="rounded p-2 text-[var(--admin-text-secondary)] hover:bg-white/5"
                    >
                      <X size={15} aria-hidden="true" />
                    </button>
                  )}

                  {canDelete && (
                    <button
                      type="button"
                      onClick={() => void remove(row.id)}
                      aria-label={t('common.delete')}
                      className="rounded p-2 text-[var(--admin-danger)] hover:bg-red-500/10"
                    >
                      <Trash2 size={15} aria-hidden="true" />
                    </button>
                  )}
                </div>
              </div>

              <p className="whitespace-pre-wrap text-sm text-[var(--admin-text-secondary)]">
                {row.body}
              </p>

              {row.moderatedBy && (
                <p className="text-[11px] text-[var(--admin-text-muted)]">
                  {t('reviews.moderatedBy', { name: row.moderatedBy })}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
