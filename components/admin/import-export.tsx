'use client';

import { useRef, useState } from 'react';
import { Download, Upload, FileSpreadsheet, Loader2, X } from 'lucide-react';
import { useT } from './i18n-provider';
import { cn } from '@/lib/utils';

interface RowIssue {
  row: number;
  cell?: string;
  column?: string;
  message: string;
}

interface Plan {
  applied: boolean;
  total: number;
  create: number;
  update: number;
  rejected: RowIssue[];
  unknownColumns: string[];
  missingColumns: string[];
  created?: number;
  updated?: number;
  failed?: { key: string; message: string }[];
}

/**
 * Import/export for one entity.
 *
 * Two downloads and one upload. The upload is always a DRY RUN first: the plan
 * comes back, the person reads it, and only then is anything written. A
 * spreadsheet applied straight to a live catalogue is how a mistyped column
 * wipes 400 prices and the person finds out from a customer.
 */
export function ImportExport({
  entity,
  canImport = true,
}: {
  entity: string;
  /** False for export-only entities, so no upload control is offered at all. */
  canImport?: boolean;
}) {
  const t = useT();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [busy, setBusy] = useState<false | 'dry' | 'apply'>(false);
  const [error, setError] = useState<string | null>(null);

  const base = `/api/import-export/${entity}`;

  const send = async (chosen: File, apply: boolean) => {
    setBusy(apply ? 'apply' : 'dry');
    setError(null);
    try {
      const body = new FormData();
      body.append('file', chosen);
      const res = await fetch(`${base}${apply ? '?apply=1' : ''}`, {
        method: 'POST',
        credentials: 'same-origin',
        body,
      });
      const json = await res.json();
      if (!res.ok || !json?.success) {
        setError(json?.error?.message ?? t('ie.failed'));
        if (json?.data) setPlan(json.data as Plan);
        return;
      }
      setPlan(json.data as Plan);
      if (apply) setFile(null);
    } catch {
      setError(t('ie.failed'));
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setFile(null);
    setPlan(null);
    setError(null);
  };

  return (
    <div className="space-y-3" data-test-id={`import-export-${entity}`}>
      <div className="flex flex-wrap items-center gap-2">
        <a href={`${base}?format=xlsx`} className="admin-btn-ghost" data-test-id="ie-export-xlsx">
          <Download size={16} aria-hidden="true" />
          {t('ie.exportXlsx')}
        </a>
        <a href={`${base}?format=csv`} className="admin-btn-ghost" data-test-id="ie-export-csv">
          <Download size={16} aria-hidden="true" />
          {t('ie.exportCsv')}
        </a>

        {canImport && (
          <>
            <a
              href={`${base}?format=xlsx&template=1`}
              className="admin-btn-ghost"
              data-test-id="ie-template"
            >
              <FileSpreadsheet size={16} aria-hidden="true" />
              {t('ie.template')}
            </a>

            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="admin-btn-ghost"
              data-test-id="ie-choose"
            >
              <Upload size={16} aria-hidden="true" />
              {t('ie.import')}
            </button>

            <input
              ref={fileRef}
              type="file"
              accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="sr-only"
              data-test-id="ie-file"
              onChange={(e) => {
                const chosen = e.target.files?.[0];
                e.target.value = '';
                if (!chosen) return;
                setFile(chosen);
                setPlan(null);
                void send(chosen, false);
              }}
            />
          </>
        )}

        {busy && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
      </div>

      {error && (
        <p className="text-sm text-[var(--admin-danger)]" data-test-id="ie-error">
          {error}
        </p>
      )}

      {plan && (
        <div
          className="space-y-2 rounded-lg border border-[var(--admin-line)] bg-[var(--admin-elevated)] p-3 text-sm"
          data-test-id="ie-plan"
        >
          <div className="flex items-start justify-between gap-3">
            <p className="font-medium">
              {plan.applied
                ? t('ie.applied', { created: plan.created ?? 0, updated: plan.updated ?? 0 })
                : t('ie.preview', { total: plan.total, create: plan.create, update: plan.update })}
            </p>
            <button
              type="button"
              onClick={reset}
              aria-label={t('common.close')}
              className="rounded p-1 hover:bg-white/5"
            >
              <X size={14} aria-hidden="true" />
            </button>
          </div>

          {plan.missingColumns.length > 0 && (
            <p className="text-[var(--admin-danger)]" data-test-id="ie-missing">
              {t('ie.missingColumns', { list: plan.missingColumns.join(', ') })}
            </p>
          )}

          {plan.unknownColumns.length > 0 && (
            // Named rather than ignored: a column the file has and we do not is
            // usually a header that was renamed, and silently dropping it is
            // how "I filled that in" becomes unanswerable.
            <p className="text-[var(--admin-warning)]" data-test-id="ie-unknown">
              {t('ie.unknownColumns', { list: plan.unknownColumns.join(', ') })}
            </p>
          )}

          {plan.rejected.length > 0 && (
            <details data-test-id="ie-rejected">
              <summary className="cursor-pointer text-[var(--admin-warning)]">
                {t('ie.rejected', { n: plan.rejected.length })}
              </summary>
              <ul className="mt-2 space-y-1 text-xs text-[var(--admin-text-secondary)]">
                {/* Capped: a badly mapped file rejects every row, and 5,000
                    identical lines are not a report. */}
                {plan.rejected.slice(0, 50).map((issue, i) => (
                  <li key={i} dir="ltr" className="text-start font-mono">
                    {issue.cell ?? `row ${issue.row + 2}`} — {issue.column ? `${issue.column}: ` : ''}
                    {issue.message}
                  </li>
                ))}
                {plan.rejected.length > 50 && (
                  <li>{t('ie.andMore', { n: plan.rejected.length - 50 })}</li>
                )}
              </ul>
            </details>
          )}

          {plan.failed && plan.failed.length > 0 && (
            <p className="text-[var(--admin-danger)]" data-test-id="ie-failed">
              {t('ie.failedRows', { n: plan.failed.length })}
            </p>
          )}

          {!plan.applied && plan.missingColumns.length === 0 && (plan.create > 0 || plan.update > 0) && (
            <button
              type="button"
              onClick={() => file && void send(file, true)}
              disabled={busy !== false}
              className={cn('admin-btn-primary', busy !== false && 'opacity-60')}
              data-test-id="ie-apply"
            >
              {t('ie.apply', { create: plan.create, update: plan.update })}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
