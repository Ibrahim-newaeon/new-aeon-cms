'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { SlidersHorizontal, X } from 'lucide-react';

/**
 * The mobile presentation of the filter panel.
 *
 * A bottom sheet rather than a narrow sidebar, because most of this shop's
 * traffic is a phone and a 260px column of checkboxes on a 390px screen leaves
 * no room for the grid it is meant to be filtering.
 *
 * The panel itself is the SAME server-rendered markup shown in the desktop
 * sidebar, passed in as children. Only the container is a client component, so
 * the filters keep working with no JavaScript — the sheet is progressive
 * enhancement over links that already work.
 */
export function ShopFilterSheet({
  label,
  close,
  applied,
  children,
}: {
  label: string;
  close: string;
  /** Count of active filters, shown on the button so state is visible closed. */
  applied: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const openButtonRef = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();
  const params = useSearchParams();

  // Picking a filter is a navigation, and the sheet must not survive it —
  // otherwise the shopper taps "Perfumes" and stares at the sheet instead of
  // the results they just asked for.
  useEffect(() => {
    setOpen(false);
  }, [pathname, params]);

  useEffect(() => {
    if (!open) return;

    const panel = panelRef.current;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        return;
      }
      if (e.key !== 'Tab' || !panel) return;

      const focusable = panel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea, input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) {
        e.preventDefault();
        panel.focus();
        return;
      }
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);

    // Without this the page behind scrolls under the sheet on iOS.
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    panel?.focus();

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
      openButtonRef.current?.focus();
    };
  }, [open]);

  return (
    <div className="lg:hidden">
      <button
        ref={openButtonRef}
        type="button"
        onClick={() => setOpen(true)}
        className="site-btn-outline inline-flex items-center gap-2 py-1.5 text-sm"
        data-test-id="shop-filter-open"
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <SlidersHorizontal size={16} aria-hidden="true" />
        {label}
        {applied > 0 && (
          <span className="rounded-full bg-site-accent px-1.5 text-xs text-site-accent-ink tabular-nums">
            {applied}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end" data-test-id="shop-filter-sheet">
          <button
            type="button"
            aria-label={close}
            onClick={() => setOpen(false)}
            className="site-scrim absolute inset-0"
          />
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={label}
            tabIndex={-1}
            className="relative max-h-[80vh] w-full overflow-y-auto rounded-t-2xl bg-site-surface p-4 pb-8 shadow-xl outline-none"
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold text-site-ink">{label}</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={close}
                className="rounded p-1 text-site-ink-muted hover:bg-site-surface-raised"
                data-test-id="shop-filter-close"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            {children}
          </div>
        </div>
      )}
    </div>
  );
}
