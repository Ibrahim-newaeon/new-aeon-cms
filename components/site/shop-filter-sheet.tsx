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

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);

    // Without this the page behind scrolls under the sheet on iOS.
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    panelRef.current?.focus();

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <div className="lg:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="site-btn-outline inline-flex items-center gap-2 py-1.5 text-sm"
        data-test-id="shop-filter-open"
        aria-expanded={open}
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
            className="relative max-h-[80vh] w-full overflow-y-auto rounded-t-2xl bg-site-surface p-4 pb-8 shadow-xl"
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
