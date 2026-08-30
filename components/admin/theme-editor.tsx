'use client';

import { useRef, useState } from 'react';
import { Download, Upload, RotateCcw } from 'lucide-react';
import { useT, useAdminI18n } from './i18n-provider';
import { COLOR_SLOTS, RADIUS_FALLBACK, themeToFile, type Theme } from '@/lib/theme/slots';
import { checkContrast, parseThemeFile } from '@/lib/theme/import';
import type { MessageKey } from '@/lib/admin-i18n';

const GROUP_LABEL: Record<string, MessageKey> = {
  brand: 'settings.themeGroupBrand',
  surface: 'settings.themeGroupSurface',
  text: 'settings.themeGroupText',
  status: 'settings.themeGroupStatus',
  shop: 'settings.themeGroupShop',
};

const GROUPS = ['brand', 'surface', 'text', 'status', 'shop'] as const;

/**
 * The two ways in, feeding one fixed list of slots.
 *
 * Pickers for someone choosing colours by hand; upload for someone handed a
 * design system by a designer. Download exists so the second group has
 * something to fill in — the export IS the template, which also makes a theme
 * portable between sites.
 */
export function ThemeEditor({
  value,
  onChange,
  commerceEnabled,
}: {
  value: Theme;
  onChange: (theme: Theme) => void;
  commerceEnabled: boolean;
}) {
  const t = useT();
  const { locale } = useAdminI18n();
  const fileRef = useRef<HTMLInputElement>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const slots = COLOR_SLOTS.filter((slot) => slot.group !== 'shop' || commerceEnabled);
  const contrast = checkContrast(value);

  const set = (name: string, colour: string) => onChange({ ...value, [name]: colour });

  const download = () => {
    // A Blob download rather than a route: this is data the form already holds,
    // and it must reflect UNSAVED edits — a round trip to the server would hand
    // back the last saved theme instead of the one on screen.
    const blob = new Blob([JSON.stringify(themeToFile(value), null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'design-system.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const upload = async (file: File) => {
    setError(null);
    setNotes([]);
    try {
      const result = parseThemeFile(await file.text());
      onChange({ ...value, ...result.theme });

      const lines = [t('settings.themeApplied', { n: result.applied.length })];
      // Reported, not swallowed: "I uploaded my brand and nothing happened" has
      // to have an answer on screen.
      if (result.unknown.length) {
        lines.push(t('settings.themeUnknown', { list: result.unknown.slice(0, 8).join(', ') }));
      }
      if (result.invalid.length) {
        lines.push(
          t('settings.themeInvalid', { list: result.invalid.map((i) => i.name).join(', ') })
        );
      }
      setNotes(lines);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read that file.');
    }
  };

  return (
    <div className="space-y-5" data-test-id="theme-editor">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={download} className="admin-btn-ghost" data-test-id="theme-download">
          <Download size={16} aria-hidden="true" />
          {t('settings.themeDownload')}
        </button>

        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="admin-btn-ghost"
          data-test-id="theme-upload"
        >
          <Upload size={16} aria-hidden="true" />
          {t('settings.themeUpload')}
        </button>

        <button
          type="button"
          onClick={() => {
            onChange({});
            setNotes([]);
            setError(null);
          }}
          className="admin-btn-ghost"
          data-test-id="theme-reset"
        >
          <RotateCcw size={16} aria-hidden="true" />
          {t('settings.themeReset')}
        </button>

        <input
          ref={fileRef}
          type="file"
          accept="application/json,text/css,.json,.css"
          className="sr-only"
          data-test-id="theme-file"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
            e.target.value = '';
          }}
        />
      </div>

      {notes.length > 0 && (
        <ul className="space-y-1 text-xs text-[var(--admin-text-secondary)]" data-test-id="theme-notes">
          {notes.map((note, i) => (
            <li key={i}>{note}</li>
          ))}
        </ul>
      )}

      {error && (
        <p className="text-xs text-[var(--admin-danger)]" data-test-id="theme-error">
          {error}
        </p>
      )}

      {contrast.length > 0 && (
        // A warning, not a block: the business owns its brand, and a ratio just
        // under the threshold may be a deliberate call. But it must be said
        // BEFORE saving, not discovered by a customer who cannot read a button.
        <p className="text-xs text-[var(--admin-warning)]" data-test-id="theme-contrast">
          {t('settings.themeContrast', {
            list: contrast.map((c) => `${c.label} (${c.ratio}:1)`).join('، '),
          })}
        </p>
      )}

      {GROUPS.filter((group) => slots.some((s) => s.group === group)).map((group) => (
        <fieldset key={group} className="space-y-2">
          <legend className="text-xs font-medium text-[var(--admin-text-secondary)]">
            {t(GROUP_LABEL[group]!)}
          </legend>

          <div className="grid gap-2 sm:grid-cols-2">
            {slots
              .filter((slot) => slot.group === group)
              .map((slot) => {
                const current = value[slot.name] ?? slot.fallback;
                return (
                  <label key={slot.name} className="flex items-center gap-3">
                    <input
                      type="color"
                      value={current}
                      onChange={(e) => set(slot.name, e.target.value)}
                      aria-label={locale === 'ar' ? slot.labelAr : slot.labelEn}
                      data-test-id={`theme-slot-${slot.name}`}
                      className="h-9 w-12 shrink-0 cursor-pointer rounded border border-[var(--admin-line)] bg-transparent"
                    />
                    <span className="min-w-0 flex-1 text-sm">
                      <span className="block truncate">
                        {locale === 'ar' ? slot.labelAr : slot.labelEn}
                      </span>
                      <span className="block font-mono text-xs text-[var(--admin-text-muted)]" dir="ltr">
                        {current}
                      </span>
                    </span>
                  </label>
                );
              })}
          </div>
        </fieldset>
      ))}

      <label className="block max-w-xs">
        <span className="mb-1 block text-xs text-[var(--admin-text-secondary)]">
          {t('settings.themeRadius')}
        </span>
        <input
          type="text"
          dir="ltr"
          className="admin-input py-2 text-sm text-start"
          placeholder={RADIUS_FALLBACK}
          value={value.radius ?? ''}
          onChange={(e) => onChange({ ...value, radius: e.target.value || undefined })}
          data-test-id="theme-radius"
        />
      </label>
    </div>
  );
}
