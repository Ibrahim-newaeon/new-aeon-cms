// components/admin/taxonomy-picker.tsx
'use client';

import { cn } from '@/lib/utils';
import type { TaxonomyOption } from '@/lib/content/page-draft';

/**
 * Toggle chips rather than a multi-select. A native `<select multiple>` hides
 * the current selection behind scroll and needs ctrl-click to deselect — for a
 * handful of categories, chips show state at a glance.
 */
export function TaxonomyPicker({
  label,
  emptyHint,
  options,
  selected,
  onChange,
  testId,
}: {
  label: string;
  emptyHint: string;
  options: TaxonomyOption[];
  selected: string[];
  onChange: (ids: string[]) => void;
  testId: string;
}) {
  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);

  return (
    <fieldset data-test-id={testId}>
      <legend className="mb-2 text-sm text-[var(--admin-text-secondary)]">
        {label}
        {selected.length > 0 && (
          <span className="ms-2 text-xs text-[var(--admin-text-muted)]" dir="ltr">
            {selected.length}
          </span>
        )}
      </legend>

      {options.length === 0 ? (
        <p className="text-xs text-[var(--admin-text-muted)]">{emptyHint}</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {options.map((option) => {
            const on = selected.includes(option.id);
            return (
              <button
                key={option.id}
                type="button"
                role="switch"
                aria-checked={on}
                onClick={() => toggle(option.id)}
                data-test-id={`${testId}-${option.id}`}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs transition-colors',
                  // Children are indented so the hierarchy is visible in a flat list.
                  option.isChild && 'ms-4',
                  on
                    ? 'border-[var(--admin-accent)] bg-[var(--admin-accent-muted)] text-[var(--admin-accent-soft)]'
                    : 'border-[var(--admin-line)] text-[var(--admin-text-secondary)] hover:bg-white/5'
                )}
              >
                {option.isChild && <span aria-hidden="true">↳ </span>}
                {option.label}
              </button>
            );
          })}
        </div>
      )}
    </fieldset>
  );
}
