'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, Loader2, Lock } from 'lucide-react';
import { useT } from './i18n-provider';
import type { ContentTypeRow } from '@/lib/content/types-admin';

/**
 * Create and edit content types.
 *
 * The table has always accepted rows; what it could not do was give one a URL.
 * The address field is the whole point of this screen, and the server checks it
 * against every route the site already has — a type at "shop" would not break
 * the store, it would silently never resolve.
 */
type Draft = {
  slug: string;
  name: string;
  routePrefix: string;
  hasArchive: boolean;
  hasCategories: boolean;
  hasTags: boolean;
  hasFeaturedImage: boolean;
  isActive: boolean;
  sortOrder: number;
};

const emptyDraft = (): Draft => ({
  slug: '',
  name: '',
  routePrefix: '',
  hasArchive: true,
  hasCategories: true,
  hasTags: true,
  hasFeaturedImage: true,
  isActive: true,
  sortOrder: 0,
});

export function ContentTypesManager({ initial }: { initial: ContentTypeRow[] }) {
  const t = useT();
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/content-types', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          ...draft,
          routePrefix: draft.routePrefix.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json?.success) {
        // The server's message names the conflicting word; showing a generic
        // "invalid" here would throw away the only useful part.
        setError(json?.error?.message ?? t('common.actionFailed'));
        return;
      }
      setCreating(false);
      setDraft(emptyDraft());
      router.refresh();
    } catch {
      setError(t('common.actionFailed'));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (row: ContentTypeRow) => {
    setError(null);
    const res = await fetch(`/api/content-types/${row.id}`, {
      method: 'DELETE',
      credentials: 'same-origin',
    });
    const json = await res.json();
    if (!res.ok || !json?.success) {
      setError(json?.error?.message ?? t('common.actionFailed'));
      return;
    }
    router.refresh();
  };

  return (
    <div className="flex flex-col gap-4" data-test-id="content-types">
      {error && (
        <p className="text-sm text-[var(--admin-danger)]" data-test-id="type-error">
          {error}
        </p>
      )}

      <div className="admin-card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--admin-line)] text-xs uppercase tracking-wide text-[var(--admin-text-muted)]">
              <th className="p-3 text-start font-medium">{t('types.name')}</th>
              <th className="p-3 text-start font-medium">{t('types.key')}</th>
              <th className="p-3 text-start font-medium">{t('types.address')}</th>
              <th className="p-3 text-start font-medium">{t('types.entries')}</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {initial.map((row) => (
              <tr key={row.id} className="border-b border-[var(--admin-line)] last:border-b-0">
                <td className="p-3 font-medium">
                  <span className="inline-flex items-center gap-2">
                    {row.name}
                    {row.isBuiltIn && (
                      <span
                        className="inline-flex items-center gap-1 text-xs text-[var(--admin-text-muted)]"
                        title={t('types.builtInHint')}
                      >
                        <Lock size={12} aria-hidden="true" />
                        {t('types.builtIn')}
                      </span>
                    )}
                  </span>
                </td>
                <td className="p-3 font-mono text-xs" dir="ltr">{row.slug}</td>
                <td className="p-3 font-mono text-xs" dir="ltr">
                  {row.routePrefix ? `/${row.routePrefix}` : t('types.noPublicPage')}
                </td>
                <td className="p-3 tabular-nums">{row.entryCount}</td>
                <td className="p-3 text-end">
                  {!row.isBuiltIn && (
                    <button
                      type="button"
                      onClick={() => void remove(row)}
                      className="rounded p-1 text-[var(--admin-text-muted)] hover:text-[var(--admin-danger)]"
                      aria-label={t('common.delete')}
                      data-test-id={`type-delete-${row.slug}`}
                    >
                      <Trash2 size={14} aria-hidden="true" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {creating ? (
        <div className="admin-card flex flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm">
              {t('types.name')}
              <input
                className="admin-input"
                value={draft.name}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                data-test-id="type-name"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              {t('types.key')}
              <input
                className="admin-input"
                dir="ltr"
                value={draft.slug}
                onChange={(e) => setDraft((d) => ({ ...d, slug: e.target.value }))}
                placeholder="case-study"
                data-test-id="type-slug"
              />
            </label>
          </div>

          <label className="flex flex-col gap-1 text-sm">
            {t('types.address')}
            <input
              className="admin-input"
              dir="ltr"
              value={draft.routePrefix}
              onChange={(e) => setDraft((d) => ({ ...d, routePrefix: e.target.value }))}
              placeholder="case-studies"
              data-test-id="type-prefix"
            />
            <span className="text-xs text-[var(--admin-text-muted)]">
              {t('types.addressHint')}
            </span>
          </label>

          <div className="flex flex-wrap gap-4 text-sm">
            {([
              ['hasArchive', 'types.hasArchive'],
              ['hasCategories', 'types.hasCategories'],
              ['hasTags', 'types.hasTags'],
              ['hasFeaturedImage', 'types.hasFeaturedImage'],
            ] as const).map(([key, label]) => (
              <label key={key} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={draft[key]}
                  onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.checked }))}
                />
                {t(label)}
              </label>
            ))}
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void save()}
              disabled={busy}
              className="admin-btn"
              data-test-id="type-save"
            >
              {busy && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}
              {t('common.save')}
            </button>
            <button
              type="button"
              onClick={() => { setCreating(false); setError(null); }}
              className="admin-btn-ghost"
            >
              {t('common.cancel')}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="admin-btn self-start"
          data-test-id="type-new"
        >
          <Plus size={16} aria-hidden="true" />
          {t('types.new')}
        </button>
      )}
    </div>
  );
}
