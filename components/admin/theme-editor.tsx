'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, Upload, RotateCcw, Monitor, Smartphone, RefreshCw, Sun, MoonStar } from 'lucide-react';
import { useT, useAdminI18n } from './i18n-provider';
import {
  COLOR_SLOTS,
  RADIUS_FALLBACK,
  THEME_MODES,
  themeToCss,
  themeToFile,
  resolveDark,
  hasDark,
  type Theme,
  type ThemeMode,
} from '@/lib/theme/slots';
import { SKINS } from '@/lib/theme/presets';
import { checkContrast, parseThemeFile } from '@/lib/theme/import';
import type { MessageKey } from '@/lib/admin-i18n';
import { cn } from '@/lib/utils';

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
  dark,
  mode,
  onChange,
  onDarkChange,
  onModeChange,
  commerceEnabled,
}: {
  value: Theme;
  dark: Theme;
  mode: ThemeMode;
  onChange: (theme: Theme) => void;
  onDarkChange: (theme: Theme) => void;
  onModeChange: (mode: ThemeMode) => void;
  commerceEnabled: boolean;
}) {
  const t = useT();
  const { locale } = useAdminI18n();
  const fileRef = useRef<HTMLInputElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [device, setDevice] = useState<'desktop' | 'phone'>('desktop');

  /**
   * Which variant the pickers below are editing.
   *
   * Local state, not a saved setting: it is a view of the form, not a property
   * of the site. The site's own choice is `mode`, which is a separate control —
   * conflating the two would mean you could not look at your dark colours
   * without also switching your live storefront to dark.
   */
  const [editing, setEditing] = useState<'light' | 'dark'>('light');

  /**
   * The theme the pickers read and write.
   *
   * On the dark tab this is the RESOLVED dark theme — light with dark laid over
   * it — because that is what the cascade actually serves. Showing the raw dark
   * object would present an unset slot as its light-mode fallback (a white page
   * background on the dark tab), which is not what the visitor sees.
   */
  const active = editing === 'dark' ? resolveDark(value, dark) : value;
  const setActive = editing === 'dark' ? onDarkChange : onChange;

  /**
   * Paints the draft onto the previewed site.
   *
   * A <style> in the frame's <head>, NOT inline properties on its <html>.
   * Setting them inline worked, but it mutates an element React is about to
   * hydrate inside the frame, and every preview load logged a hydration
   * mismatch on the storefront — a real error, caused by the preview, sitting
   * in the console of the page being previewed.
   *
   * `:root:root` gives the draft double specificity, so it wins over the
   * site's own saved-theme rule without depending on document order. Clearing
   * a slot simply omits it, and the site falls back to its saved value.
   *
   * Same-origin, so reaching into the frame is allowed: the admin and the
   * storefront are one app.
   */
  const paintPreview = useCallback(() => {
    const doc = frameRef.current?.contentDocument;
    if (!doc?.head) return;

    const id = 'aeon-theme-preview';
    let style = doc.getElementById(id) as HTMLStyleElement | null;
    if (!style) {
      style = doc.createElement('style');
      style.id = id;
      doc.head.appendChild(style);
    }
    style.textContent = themeToCss(active, ':root:root');

    // The preview frame is a real storefront page, so the variant being edited
    // has to be stamped on it the same way the server stamps the live site —
    // otherwise a dark draft paints dark tokens onto a page still claiming to
    // be light.
    doc.documentElement.setAttribute('data-theme', editing);
  }, [active, editing]);

  useEffect(() => {
    paintPreview();
  }, [paintPreview]);

  const slots = COLOR_SLOTS.filter((slot) => slot.group !== 'shop' || commerceEnabled);
  // Checked against the resolved variant for the same reason the pickers show
  // it: a contrast warning about colours the visitor never sees is noise.
  const contrast = checkContrast(active);

  const set = (name: string, colour: string) => setActive({ ...active, [name]: colour });

  const download = () => {
    // A Blob download rather than a route: this is data the form already holds,
    // and it must reflect UNSAVED edits — a round trip to the server would hand
    // back the last saved theme instead of the one on screen.
    const blob = new Blob([JSON.stringify(themeToFile(active), null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `design-system-${editing}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const upload = async (file: File) => {
    setError(null);
    setNotes([]);
    try {
      const result = parseThemeFile(await file.text());
      setActive({ ...active, ...result.theme });

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
      <div className="space-y-2">
        <p className="text-xs text-[var(--admin-text-secondary)]">
          {t('settings.themePresets')} — {t('settings.themePresetsHint')}
        </p>
        <div className="flex flex-wrap gap-2">
          {SKINS.map((skin) => (
            <button
              key={skin.id}
              type="button"
              // Applies BOTH halves, and replaces rather than merges: a skin
              // that inherited stray slots from the previous one would not be
              // the skin. Picking a skin while looking at the dark tab still
              // sets its light half — they are one choice, not two.
              onClick={() => {
                onChange({ ...skin.light });
                onDarkChange({ ...skin.dark });
                setNotes([]);
                setError(null);
              }}
              data-test-id={`theme-preset-${skin.id}`}
              className="flex items-center gap-2 rounded-lg border border-[var(--admin-line)] px-3 py-2 text-sm hover:bg-white/5"
            >
              {/* Both halves in the swatch — the accent and page of each — so
                  the pair is visible before it is applied. */}
              <span className="flex">
                {(
                  [
                    [skin.light, 'accent'],
                    [skin.light, 'surface'],
                    [skin.dark, 'accent'],
                    [skin.dark, 'surface'],
                  ] as const
                ).map(([theme, slot], i) => (
                  <span
                    key={i}
                    aria-hidden="true"
                    className="h-4 w-4 rounded-full border border-black/10 -ms-1 first:ms-0"
                    style={{ background: theme[slot] }}
                  />
                ))}
              </span>
              {locale === 'ar' ? skin.nameAr : skin.nameEn}
            </button>
          ))}
        </div>
      </div>

      {/*
        Which variant visitors get. Separate from the tab below, which only
        decides what this form is showing.
      */}
      <fieldset className="space-y-2" data-test-id="theme-mode">
        <legend className="text-xs text-[var(--admin-text-secondary)]">
          {t('settings.themeMode')} — {t('settings.themeModeHint')}
        </legend>
        <div className="flex flex-wrap gap-2">
          {THEME_MODES.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => onModeChange(m)}
              aria-pressed={mode === m}
              data-test-id={`theme-mode-${m}`}
              className={cn(
                'rounded-lg border px-3 py-2 text-sm',
                mode === m
                  ? 'border-[var(--admin-accent)] bg-white/10'
                  : 'border-[var(--admin-line)] hover:bg-white/5'
              )}
            >
              {t(`settings.themeMode.${m}` as MessageKey)}
            </button>
          ))}
        </div>

        {/* Said plainly rather than left to be discovered: choosing dark or
            auto with no dark colours saved would silently do nothing. */}
        {mode !== 'light' && !hasDark(dark) && (
          <p className="text-xs text-[var(--admin-warning)]" data-test-id="theme-mode-warning">
            {t('settings.themeNoDark')}
          </p>
        )}
      </fieldset>

      {/*
        The variant this form is editing. A view of the form, not a site
        setting — the site's choice is the control above.
      */}
      <div
        className="flex gap-1 rounded-lg border border-[var(--admin-line)] p-1"
        role="group"
        aria-label={t('settings.themeEditing')}
      >
        {(['light', 'dark'] as const).map((variant) => (
          <button
            key={variant}
            type="button"
            onClick={() => setEditing(variant)}
            aria-pressed={editing === variant}
            data-test-id={`theme-edit-${variant}`}
            className={cn(
              'flex flex-1 items-center justify-center gap-2 rounded px-3 py-2 text-sm',
              editing === variant ? 'bg-white/10' : 'hover:bg-white/5'
            )}
          >
            {variant === 'light' ? (
              <Sun size={16} aria-hidden="true" />
            ) : (
              <MoonStar size={16} aria-hidden="true" />
            )}
            {t(`settings.themeEditing.${variant}` as MessageKey)}
          </button>
        ))}
      </div>

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
            // Clears only the variant on screen. Resetting the light theme
            // from the dark tab would be a surprise.
            setActive({});
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
                // `active`, not `value`: on the dark tab this must be the dark
                // colour, or the pickers show — and write back — the light one.
                const current = active[slot.name] ?? slot.fallback;
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

      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-[var(--admin-text-secondary)]">
            {t('settings.themePreview')} — {t('settings.themePreviewHint')}
          </p>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setDevice('desktop')}
              aria-pressed={device === 'desktop'}
              aria-label={t('settings.themePreviewDesktop')}
              data-test-id="theme-preview-desktop"
              className={cn('rounded p-1.5', device === 'desktop' ? 'bg-white/10' : 'hover:bg-white/5')}
            >
              <Monitor size={16} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => setDevice('phone')}
              aria-pressed={device === 'phone'}
              aria-label={t('settings.themePreviewPhone')}
              data-test-id="theme-preview-phone"
              className={cn('rounded p-1.5', device === 'phone' ? 'bg-white/10' : 'hover:bg-white/5')}
            >
              <Smartphone size={16} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => {
                // Re-navigating rather than reassigning src: the draft is
                // re-painted by onLoad, so a reload shows saved content with
                // unsaved colours, which is what a preview is for.
                frameRef.current?.contentWindow?.location.reload();
              }}
              aria-label={t('settings.themePreviewReload')}
              data-test-id="theme-preview-reload"
              className="rounded p-1.5 hover:bg-white/5"
            >
              <RefreshCw size={16} aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-[var(--admin-line)] bg-[var(--admin-elevated)] p-3">
          <iframe
            ref={frameRef}
            src={`/${locale}`}
            title={t('settings.themePreview')}
            onLoad={paintPreview}
            data-test-id="theme-preview-frame"
            className={cn(
              'h-[460px] border-0 bg-white transition-all',
              device === 'phone' ? 'mx-auto w-[390px] rounded-2xl' : 'w-full rounded'
            )}
          />
        </div>
      </section>

      <label className="block max-w-xs">
        <span className="mb-1 block text-xs text-[var(--admin-text-secondary)]">
          {t('settings.themeRadius')}
        </span>
        <input
          type="text"
          dir="ltr"
          className="admin-input py-2 text-sm text-start"
          placeholder={RADIUS_FALLBACK}
          value={active.radius ?? ''}
          onChange={(e) => setActive({ ...active, radius: e.target.value || undefined })}
          data-test-id="theme-radius"
        />
      </label>
    </div>
  );
}
