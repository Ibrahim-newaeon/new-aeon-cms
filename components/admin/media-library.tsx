// components/admin/media-library.tsx
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { UploadCloud, Trash2, Copy, Check, Loader2, FileText, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useT } from './i18n-provider';

export interface MediaAsset {
  id: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  url: string;
  thumbnailUrl: string | null;
  width: number | null;
  height: number | null;
  altText: string | null;
  createdAt: string | null;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface MediaLibraryProps {
  initial: MediaAsset[];
  /** Picker mode: clicking a tile selects it instead of opening details. */
  onSelect?: (asset: MediaAsset) => void;
  selectable?: boolean;
  /** How many uploads nothing currently references. Absent in picker mode. */
  unusedCount?: number;
  /** True when the grid is already filtered to unused assets. */
  showingUnused?: boolean;
  /** Bulk cleanup is admin-only. */
  canCleanup?: boolean;
}

export function MediaLibrary({
  initial,
  onSelect,
  selectable = false,
  unusedCount,
  showingUnused = false,
  canCleanup = false,
}: MediaLibraryProps) {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [cleaning, setCleaning] = useState(false);

  const toggleUnused = () => {
    const next = new URLSearchParams(searchParams.toString());
    if (showingUnused) next.delete('filter');
    else next.set('filter', 'unused');
    router.push(`${pathname}?${next.toString()}`);
  };

  /**
   * Deletes everything currently listed as unused.
   *
   * The ids are re-checked server-side before anything is removed: this grid is
   * a snapshot, and an editor in another tab can drop one of these images into
   * a page between it rendering and this click.
   */
  const cleanUp = async () => {
    const ids = assets.map((a) => a.id);
    if (ids.length === 0) return;
    if (!window.confirm(t('media.cleanupConfirm', { count: ids.length }))) return;

    setCleaning(true);
    try {
      const res = await fetch('/api/media/cleanup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ ids }),
      });
      const data = await res.json().catch(() => null);

      if (data?.success) {
        setAssets((prev) => prev.filter((a) => !ids.includes(a.id)));
        // `skipped` means something became referenced between listing and
        // deleting — worth saying rather than silently doing less.
        if (data.data?.skipped > 0) {
          window.alert(t('media.cleanupSkipped', { count: data.data.skipped }));
        }
        router.refresh();
      }
    } finally {
      setCleaning(false);
    }
  };
  const [assets, setAssets] = useState<MediaAsset[]>(initial);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = useCallback(async (files: FileList | File[]) => {
    const list = Array.from(files);
    if (list.length === 0) return;

    setUploading(true);
    setErrors([]);

    const form = new FormData();
    for (const f of list) form.append('file', f);

    try {
      const res = await fetch('/api/media', {
        method: 'POST',
        credentials: 'same-origin',
        body: form,
      });
      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.success) {
        setErrors([data?.error?.message ?? t('media.uploadFailed')]);
        return;
      }

      if (Array.isArray(data.rejected) && data.rejected.length > 0) {
        setErrors(data.rejected);
      }
      setAssets((prev) => [...(data.data as MediaAsset[]), ...prev]);
    } catch {
      setErrors([t('media.networkFailed')]);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }, []);

  const remove = async (id: string) => {
    if (!window.confirm(t('media.deleteConfirm'))) return;
    const res = await fetch(`/api/media/${id}`, { method: 'DELETE', credentials: 'same-origin' });
    if (res.ok) setAssets((prev) => prev.filter((a) => a.id !== id));
  };

  const saveAlt = async (id: string, altText: string) => {
    await fetch(`/api/media/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ altText }),
    });
    setAssets((prev) => prev.map((a) => (a.id === id ? { ...a, altText } : a)));
  };

  const copy = async (asset: MediaAsset) => {
    await navigator.clipboard.writeText(asset.url);
    setCopiedId(asset.id);
    window.setTimeout(() => setCopiedId(null), 1500);
  };

  // Page-level drag & drop. Without preventDefault the browser navigates away
  // to the dropped file, losing the page.
  useEffect(() => {
    const over = (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer?.types.includes('Files')) setDragging(true);
    };
    const leave = (e: DragEvent) => {
      if (e.relatedTarget === null) setDragging(false);
    };
    const drop = (e: DragEvent) => {
      e.preventDefault();
      setDragging(false);
      if (e.dataTransfer?.files.length) void upload(e.dataTransfer.files);
    };
    window.addEventListener('dragover', over);
    window.addEventListener('dragleave', leave);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragover', over);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('drop', drop);
    };
  }, [upload]);

  return (
    <div className="space-y-5" data-test-id="media-library">
      <div
        className={cn(
          'flex flex-col items-center gap-3 rounded-[14px] border-2 border-dashed p-8 text-center transition-colors',
          dragging
            ? 'border-[var(--admin-accent)] bg-[var(--admin-accent-muted)]'
            : 'border-[var(--admin-line)]'
        )}
      >
        <UploadCloud size={26} aria-hidden="true" className="text-[var(--admin-accent)]" />
        <p className="text-sm text-[var(--admin-text-secondary)]">
          {t('media.dropHint')}
        </p>
        <p className="text-xs text-[var(--admin-text-muted)]">
          {t('media.types')}
        </p>

        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp,image/avif,image/gif,application/pdf"
          className="sr-only"
          id="media-upload-input"
          onChange={(e) => e.target.files && void upload(e.target.files)}
        />
        {unusedCount !== undefined && (
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={toggleUnused}
              data-test-id="media-filter-unused"
              className="rounded-lg border border-[var(--admin-line)] px-3 py-1.5 text-xs text-[var(--admin-text-secondary)] hover:text-[var(--admin-text)]"
            >
              {showingUnused
                ? t('media.showAll')
                : t('media.showUnused', { count: unusedCount })}
            </button>

            {showingUnused && canCleanup && assets.length > 0 && (
              <button
                type="button"
                onClick={() => void cleanUp()}
                disabled={cleaning}
                data-test-id="media-cleanup"
                className="rounded-lg border border-[var(--admin-danger)] px-3 py-1.5 text-xs text-[var(--admin-danger)] hover:bg-red-500/10 disabled:opacity-50"
              >
                {cleaning ? t('common.saving') : t('media.deleteUnused', { count: assets.length })}
              </button>
            )}
          </div>
        )}

        <label htmlFor="media-upload-input" className="admin-btn cursor-pointer" data-test-id="media-upload">
          {uploading ? (
            <Loader2 size={16} className="animate-spin" aria-hidden="true" />
          ) : (
            <UploadCloud size={16} aria-hidden="true" />
          )}
          {uploading ? t('media.uploading') : t('media.chooseFiles')}
        </label>
      </div>

      {errors.length > 0 && (
        <ul role="alert" className="admin-card space-y-1 border-[var(--admin-danger)] text-sm text-[var(--admin-danger)]">
          {errors.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      )}

      {assets.length === 0 ? (
        <p className="admin-card py-16 text-center text-sm text-[var(--admin-text-muted)]">
          {t('media.empty')}
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {assets.map((asset) => (
            <li
              key={asset.id}
              className="group overflow-hidden rounded-[14px] border border-[var(--admin-line)] bg-[var(--admin-surface)]"
              data-test-id={`media-item-${asset.id}`}
            >
              <button
                type="button"
                onClick={() => (selectable ? onSelect?.(asset) : void copy(asset))}
                className="relative block aspect-square w-full bg-[var(--admin-bg)]"
                aria-label={selectable ? t('media.selectItem', { name: asset.originalName }) : t('media.copyLinkFor', { name: asset.originalName })}
              >
                {asset.mimeType === 'application/pdf' ? (
                  <span className="flex h-full items-center justify-center">
                    <FileText size={32} aria-hidden="true" className="text-[var(--admin-text-muted)]" />
                  </span>
                ) : (
                  <img
                    src={asset.thumbnailUrl ?? asset.url}
                    alt={asset.altText ?? ''}
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                )}

                {selectable && (
                  <span className="absolute inset-0 flex items-center justify-center bg-black/60 text-sm font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
                    {t('media.select')}
                  </span>
                )}
              </button>

              <div className="space-y-2 p-3">
                <p className="truncate text-xs text-[var(--admin-text-secondary)]" title={asset.originalName}>
                  {asset.originalName}
                </p>
                <p className="text-[11px] text-[var(--admin-text-muted)]" dir="ltr">
                  {formatBytes(asset.size)}
                  {asset.width && asset.height ? ` · ${asset.width}×${asset.height}` : ''}
                </p>

                {!selectable && (
                  <>
                    <input
                      type="text"
                      defaultValue={asset.altText ?? ''}
                      placeholder={t('media.altPlaceholder')}
                      onBlur={(e) => {
                        if (e.target.value !== (asset.altText ?? '')) {
                          void saveAlt(asset.id, e.target.value);
                        }
                      }}
                      className="admin-input py-1.5 text-xs"
                      aria-label={t('media.altFor', { name: asset.originalName })}
                    />

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => void copy(asset)}
                        aria-label={t('media.copyLink')}
                        className="flex-1 rounded p-1.5 text-[var(--admin-text-secondary)] hover:bg-white/5"
                      >
                        {copiedId === asset.id ? (
                          <Check size={14} aria-hidden="true" className="mx-auto text-[var(--admin-success)]" />
                        ) : (
                          <Copy size={14} aria-hidden="true" className="mx-auto" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => void remove(asset.id)}
                        aria-label={t('common.delete')}
                        className="rounded p-1.5 text-[var(--admin-danger)] hover:bg-red-500/10"
                        data-test-id={`media-delete-${asset.id}`}
                      >
                        <Trash2 size={14} aria-hidden="true" />
                      </button>
                    </div>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <span className="rounded-xl bg-[var(--admin-surface)] px-6 py-4 text-sm">
            {t('media.dropNow')}
          </span>
        </div>
      )}
    </div>
  );
}

/** Modal wrapper used by settings and the block editors. */
export function MediaPickerDialog({
  open,
  onClose,
  onSelect,
  assets,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (asset: MediaAsset) => void;
  assets: MediaAsset[];
}) {
  const t = useT();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('media.chooseFile')}
      className="fixed inset-0 z-[60] flex items-start justify-center overflow-auto bg-black/60 p-6"
    >
      <div className="w-full max-w-5xl rounded-[14px] border border-[var(--admin-line)] bg-[var(--admin-bg)] p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{t('media.pickerTitle')}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="rounded p-2 hover:bg-white/5"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <MediaLibrary
          initial={assets}
          selectable
          onSelect={(a) => {
            onSelect(a);
            onClose();
          }}
        />
      </div>
    </div>
  );
}
