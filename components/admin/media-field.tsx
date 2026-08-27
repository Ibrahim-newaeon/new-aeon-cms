// components/admin/media-field.tsx
'use client';

import { useEffect, useState } from 'react';
import { ImagePlus, X } from 'lucide-react';
import { MediaPickerDialog, type MediaAsset } from './media-library';

/**
 * A URL input with a "choose from library" button.
 *
 * The raw text field stays: an external CDN URL is a legitimate value, and
 * removing it would make the field less capable than before. The picker is
 * additive.
 */
export function MediaField({
  label,
  hint,
  value,
  onChange,
  testId,
  preview = true,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (url: string) => void;
  testId: string;
  preview?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Fetched on first open, not on mount — most sessions never open the picker.
  useEffect(() => {
    if (!open || loaded) return;
    void (async () => {
      try {
        const res = await fetch('/api/media', { credentials: 'same-origin' });
        const data = await res.json().catch(() => null);
        if (data?.success) setAssets(data.data as MediaAsset[]);
      } finally {
        setLoaded(true);
      }
    })();
  }, [open, loaded]);

  return (
    <div>
      <label htmlFor={testId} className="mb-2 block text-sm text-[var(--admin-text-secondary)]">
        {label}
      </label>

      <div className="flex items-center gap-2">
        <input
          id={testId}
          type="text"
          dir="ltr"
          className="admin-input text-start"
          placeholder="/uploads/… أو https://…"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          data-test-id={testId}
        />
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="admin-btn-ghost shrink-0 px-3"
          aria-label="اختيار من المكتبة"
          data-test-id={`${testId}-pick`}
        >
          <ImagePlus size={16} aria-hidden="true" />
        </button>
      </div>

      {hint && <span className="mt-1 block text-xs text-[var(--admin-text-muted)]">{hint}</span>}

      {preview && value && (
        <div className="mt-2 flex items-center gap-2">
          <img
            src={value}
            alt=""
            className="h-12 w-12 rounded border border-[var(--admin-line)] bg-[var(--admin-bg)] object-contain p-1"
          />
          <button
            type="button"
            onClick={() => onChange('')}
            className="rounded p-1.5 text-[var(--admin-text-muted)] hover:bg-white/5"
            aria-label="إزالة"
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>
      )}

      <MediaPickerDialog
        open={open}
        onClose={() => setOpen(false)}
        assets={assets}
        onSelect={(a) => onChange(a.url)}
      />
    </div>
  );
}
