'use client';

import { useState, useTransition } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Check, Archive, ArchiveRestore, Trash2, Download, Mail, Loader2 } from 'lucide-react';
import { useT, useAdminI18n } from './i18n-provider';
import { findEmail } from '@/lib/forms/csv';

export interface SubmissionRow {
  id: string;
  type: 'contact' | 'newsletter';
  payload: Record<string, string>;
  pageSlug: string | null;
  locale: string | null;
  isRead: boolean;
  archivedAt: string | null;
  createdAt: string | null;
}

interface Props {
  rows: SubmissionRow[];
  type: 'contact' | 'newsletter';
  showArchived: boolean;
  unreadCount: number;
  canDelete: boolean;
}

/**
 * Two jobs, one table.
 *
 * A contact message is a task: it arrives unread, gets handled, and leaves the
 * queue. A newsletter signup is a list entry: it is never "handled", it is
 * exported. They shared one undifferentiated list before, which served neither.
 */
export function FormsManager({ rows, type, showArchived, unreadCount, canDelete }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const t = useT();
  const { locale } = useAdminI18n();
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);

  function navigate(changes: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(changes)) {
      if (v === null || v === '') next.delete(k);
      else next.set(k, v);
    }
    startTransition(() => router.push(`${pathname}?${next.toString()}`));
  }

  async function patch(id: string, body: Record<string, unknown>) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/forms/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(body),
      });
      if (res.ok) router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function remove(id: string) {
    if (!window.confirm(t('forms.deleteConfirm'))) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/forms/${id}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      });
      if (res.ok) router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  const dateFor = (iso: string | null) =>
    iso ? new Date(iso).toLocaleString(locale === 'ar' ? 'ar-JO' : 'en-GB') : '—';

  return (
    <div className="space-y-4" data-test-id="forms-manager">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label={t('forms.tabs')} className="flex gap-1">
          {(['contact', 'newsletter'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={type === tab}
              onClick={() => navigate({ type: tab, archived: null })}
              data-test-id={`forms-tab-${tab}`}
              className={`rounded-lg px-4 py-2 text-sm transition-colors ${
                type === tab
                  ? 'bg-[var(--admin-elevated)] text-[var(--admin-text)]'
                  : 'text-[var(--admin-text-secondary)] hover:text-[var(--admin-text)]'
              }`}
            >
              {tab === 'contact' ? t('forms.typeContact') : t('forms.typeNewsletter')}
              {tab === 'contact' && unreadCount > 0 && (
                <span className="ms-2 rounded-full bg-[var(--admin-accent-muted)] px-2 py-0.5 text-[10px] text-[var(--admin-accent-soft)]">
                  {unreadCount}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {type === 'contact' && (
            <button
              type="button"
              onClick={() => navigate({ archived: showArchived ? null : '1' })}
              data-test-id="forms-toggle-archived"
              className="rounded-lg border border-[var(--admin-line)] px-3 py-1.5 text-xs text-[var(--admin-text-secondary)] hover:text-[var(--admin-text)]"
            >
              {showArchived ? t('forms.showInbox') : t('forms.showArchived')}
            </button>
          )}

          {/* A plain link, not a fetch + Blob: script-driven saves are blocked
              in some embedding contexts, an attachment response never is. */}
          <a
            href={`/api/forms/export?type=${type}`}
            className="admin-btn-ghost text-xs"
            data-test-id="forms-export"
          >
            <Download size={14} aria-hidden="true" />
            {t('forms.export')}
          </a>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="admin-card py-16 text-center text-sm text-[var(--admin-text-muted)]">
          {showArchived ? t('forms.emptyArchive') : t('forms.empty')}
        </p>
      ) : (
        <div className={`space-y-2 ${pending ? 'opacity-50 transition-opacity' : ''}`}>
          {rows.map((row) => {
            const email = findEmail(row.payload);
            const busy = busyId === row.id;

            return (
              <div
                key={row.id}
                className={`admin-card flex flex-wrap items-start justify-between gap-4 py-4 ${
                  !row.isRead && type === 'contact'
                    ? 'border-s-2 border-s-[var(--admin-accent)]'
                    : ''
                }`}
                data-test-id={`form-row-${row.id}`}
              >
                <div className="min-w-0 flex-1 space-y-1">
                  {type === 'newsletter' ? (
                    <p className="text-sm font-medium" dir="ltr">
                      <Mail size={13} aria-hidden="true" className="me-1 inline" />
                      {email ?? t('forms.noAddress')}
                    </p>
                  ) : (
                    <dl className="text-xs text-[var(--admin-text-secondary)]">
                      {Object.entries(row.payload ?? {}).map(([k, v]) => (
                        <div key={k} className="flex gap-2">
                          <dt className="text-[var(--admin-text-muted)]">{k}:</dt>
                          <dd dir="auto" className="min-w-0 break-words">{String(v)}</dd>
                        </div>
                      ))}
                    </dl>
                  )}

                  <p className="text-[11px] text-[var(--admin-text-muted)]">
                    {row.pageSlug ? `${row.pageSlug} · ` : ''}
                    <span dir="ltr">{dateFor(row.createdAt)}</span>
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  {busy && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}

                  {type === 'contact' && (
                    <>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void patch(row.id, { isRead: !row.isRead })}
                        aria-label={row.isRead ? t('forms.markUnread') : t('forms.markRead')}
                        title={row.isRead ? t('forms.markUnread') : t('forms.markRead')}
                        data-test-id={`form-read-${row.id}`}
                        className={`rounded p-2 hover:bg-white/5 ${
                          row.isRead ? 'text-[var(--admin-text-muted)]' : 'text-[var(--admin-success)]'
                        }`}
                      >
                        <Check size={15} aria-hidden="true" />
                      </button>

                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void patch(row.id, { archived: !row.archivedAt })}
                        aria-label={row.archivedAt ? t('forms.unarchive') : t('forms.archive')}
                        title={row.archivedAt ? t('forms.unarchive') : t('forms.archive')}
                        data-test-id={`form-archive-${row.id}`}
                        className="rounded p-2 text-[var(--admin-text-secondary)] hover:bg-white/5"
                      >
                        {row.archivedAt ? (
                          <ArchiveRestore size={15} aria-hidden="true" />
                        ) : (
                          <Archive size={15} aria-hidden="true" />
                        )}
                      </button>
                    </>
                  )}

                  {canDelete && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void remove(row.id)}
                      aria-label={t('common.delete')}
                      title={t('common.delete')}
                      data-test-id={`form-delete-${row.id}`}
                      className="rounded p-2 text-[var(--admin-danger)] hover:bg-red-500/10"
                    >
                      <Trash2 size={15} aria-hidden="true" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
