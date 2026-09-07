'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Upload, Trash2, Check } from 'lucide-react';
import { useT } from './i18n-provider';

type ThemeRow = {
  id: string;
  name: string;
  version: string;
  isActive: boolean;
  createdAt?: string | null;
};

export function ThemesPanel() {
  const t = useT();
  const router = useRouter();
  const [themes, setThemes] = useState<ThemeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/themes', { credentials: 'same-origin' });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data?.error?.message ?? t('common.actionFailed'));
      setThemes(data.themes ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.actionFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const upload = async (file: File) => {
    setBusy('upload');
    setError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/themes', {
        method: 'POST',
        credentials: 'same-origin',
        body: form,
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data?.error?.message ?? t('common.saveFailed'));
      await refresh();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.saveFailed'));
    } finally {
      setBusy(null);
    }
  };

  const activate = async (id: string) => {
    setBusy(id);
    setError(null);
    try {
      const res = await fetch(`/api/themes/${id}?action=activate`, {
        method: 'POST',
        credentials: 'same-origin',
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data?.error?.message ?? t('common.saveFailed'));
      await refresh();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.saveFailed'));
    } finally {
      setBusy(null);
    }
  };

  const deactivate = async () => {
    setBusy('deactivate');
    setError(null);
    try {
      const res = await fetch('/api/themes/deactivate', {
        method: 'POST',
        credentials: 'same-origin',
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data?.error?.message ?? t('common.saveFailed'));
      await refresh();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.saveFailed'));
    } finally {
      setBusy(null);
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm(t('settings.themesDeleteConfirm'))) return;
    setBusy(id);
    setError(null);
    try {
      const res = await fetch(`/api/themes/${id}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data?.error?.message ?? t('common.saveFailed'));
      await refresh();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.saveFailed'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4" data-test-id="themes-panel">
      <div>
        <h2 className="text-lg font-semibold text-[var(--admin-text)]">{t('settings.themesTitle')}</h2>
        <p className="mt-1 text-sm text-[var(--admin-text-muted)]">{t('settings.themesHint')}</p>
      </div>

      <label className="admin-btn-secondary inline-flex cursor-pointer items-center gap-2">
        {busy === 'upload' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
        {t('settings.themesUpload')}
        <input
          type="file"
          accept=".zip,application/zip"
          className="hidden"
          data-test-id="themes-upload"
          disabled={busy !== null}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload(f);
            e.target.value = '';
          }}
        />
      </label>

      {error && (
        <p className="text-sm text-[var(--admin-danger)]" data-test-id="themes-error">
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-[var(--admin-text-muted)]">{t('common.saving')}</p>
      ) : themes.length === 0 ? (
        <p className="text-sm text-[var(--admin-text-muted)]">{t('settings.themesEmpty')}</p>
      ) : (
        <ul className="divide-y divide-[var(--admin-border)] rounded-lg border border-[var(--admin-border)]">
          {themes.map((theme) => (
            <li
              key={theme.id}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
              data-test-id={`theme-row-${theme.id}`}
            >
              <div>
                <p className="font-medium text-[var(--admin-text)]">
                  {theme.name}{' '}
                  <span className="text-xs text-[var(--admin-text-muted)]">v{theme.version}</span>
                </p>
                {theme.isActive && (
                  <span className="mt-1 inline-flex items-center gap-1 text-xs text-[var(--admin-success)]">
                    <Check className="h-3 w-3" /> {t('settings.themesActive')}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {!theme.isActive && (
                  <button
                    type="button"
                    className="admin-btn-secondary text-xs"
                    disabled={busy !== null}
                    onClick={() => void activate(theme.id)}
                    data-test-id={`theme-activate-${theme.id}`}
                  >
                    {t('settings.themesActivate')}
                  </button>
                )}
                {theme.isActive && (
                  <button
                    type="button"
                    className="admin-btn-ghost text-xs"
                    disabled={busy !== null}
                    onClick={() => void deactivate()}
                    data-test-id="theme-deactivate"
                  >
                    {t('settings.themesUseBuiltin')}
                  </button>
                )}
                <button
                  type="button"
                  className="admin-btn-ghost text-xs text-[var(--admin-danger)]"
                  disabled={busy !== null}
                  onClick={() => void remove(theme.id)}
                  data-test-id={`theme-delete-${theme.id}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
