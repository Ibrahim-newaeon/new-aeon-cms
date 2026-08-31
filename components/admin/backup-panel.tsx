'use client';

import { useState } from 'react';
import { Download, Loader2, ShieldAlert } from 'lucide-react';
import { useT } from './i18n-provider';

/**
 * Download everything.
 *
 * A plain link would do the job, but the file takes a while to build on a
 * large catalogue and a browser shows nothing while it waits — so this fetches
 * it, shows that something is happening, and hands over a blob. The trade is
 * that the whole archive lands in memory; acceptable for a file measured in
 * megabytes, and the alternative is a button that looks broken.
 */
export function BackupPanel() {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const download = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/backup', { credentials: 'same-origin' });
      if (!res.ok) {
        setError(res.status === 403 ? t('backup.adminOnly') : t('common.actionFailed'));
        return;
      }

      const blob = await res.blob();
      const name =
        res.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1] ?? 'backup.zip';

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.click();
      // Revoked on the next tick: releasing it immediately can cancel the
      // download in some browsers before it has started.
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setError(t('common.actionFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3" data-test-id="backup-panel">
      <p className="text-sm text-[var(--admin-text-secondary)]">{t('backup.what')}</p>

      <button
        type="button"
        onClick={() => void download()}
        disabled={busy}
        className="admin-btn self-start"
        data-test-id="backup-download"
      >
        {busy ? (
          <Loader2 size={16} className="animate-spin" aria-hidden="true" />
        ) : (
          <Download size={16} aria-hidden="true" />
        )}
        {busy ? t('backup.building') : t('backup.download')}
      </button>

      {/* Said plainly rather than buried in the archive: someone downloading
          this is about to hold every customer's address on a laptop. */}
      <p className="flex items-start gap-2 text-xs text-[var(--admin-text-muted)]">
        <ShieldAlert size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
        {t('backup.warning')}
      </p>

      <p className="text-xs text-[var(--admin-text-muted)]">{t('backup.notPgDump')}</p>

      {error && (
        <p className="text-sm text-[var(--admin-danger)]" data-test-id="backup-error">
          {error}
        </p>
      )}
    </div>
  );
}
