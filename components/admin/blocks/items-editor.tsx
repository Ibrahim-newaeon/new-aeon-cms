// components/admin/blocks/items-editor.tsx
'use client';

import { Plus, Trash2, ChevronUp, ChevronDown } from 'lucide-react';
import { useT } from '../i18n-provider';

/**
 * Shared add/remove/reorder shell for blocks whose payload is an array of
 * objects (feature-grid, stats, gallery, team, timeline, …). Each block only
 * has to supply the per-item fields.
 */
export function ItemsEditor<T>({
  items,
  onChange,
  createItem,
  renderItem,
  addLabel,
  emptyLabel,
  testId,
  max = 50,
}: {
  items: T[];
  onChange: (items: T[]) => void;
  // NoInfer pins T to `items`. Without it TS infers T from createItem's object
  // literal, which omits the optional fields and rejects them in renderItem.
  createItem: () => NoInfer<T>;
  renderItem: (
    item: NoInfer<T>,
    update: (patch: Partial<NoInfer<T>>) => void,
    index: number
  ) => React.ReactNode;
  addLabel: string;
  emptyLabel: string;
  testId: string;
  max?: number;
}) {
  const t = useT();
  const update = (index: number, patch: Partial<T>) =>
    onChange(items.map((item, i) => (i === index ? { ...item, ...patch } : item)));

  const remove = (index: number) => onChange(items.filter((_, i) => i !== index));

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    const copy = [...items];
    const a = copy[index];
    const b = copy[target];
    // noUncheckedIndexedAccess types these as T | undefined.
    if (a === undefined || b === undefined) return;
    copy[index] = b;
    copy[target] = a;
    onChange(copy);
  };

  return (
    <div className="space-y-3" data-test-id={testId}>
      {items.length === 0 && (
        <p className="rounded border border-dashed border-[var(--admin-line)] p-4 text-center text-xs text-[var(--admin-text-muted)]">
          {emptyLabel}
        </p>
      )}

      <ul className="space-y-3">
        {items.map((item, index) => (
          <li
            key={index}
            className="rounded-md border border-[var(--admin-line)] bg-[var(--admin-elevated)] p-3 space-y-3"
            data-test-id={`${testId}-item-${index}`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-[var(--admin-text-muted)]" dir="ltr">
                #{index + 1}
              </span>
              <div className="flex items-center gap-1">
                <IconBtn
                  label={t('blocks.moveUpN', { n: index + 1 })}
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                >
                  <ChevronUp size={14} aria-hidden="true" />
                </IconBtn>
                <IconBtn
                  label={t('blocks.moveDownN', { n: index + 1 })}
                  disabled={index === items.length - 1}
                  onClick={() => move(index, 1)}
                >
                  <ChevronDown size={14} aria-hidden="true" />
                </IconBtn>
                <IconBtn label={t('blocks.deleteN', { n: index + 1 })} danger onClick={() => remove(index)}>
                  <Trash2 size={14} aria-hidden="true" />
                </IconBtn>
              </div>
            </div>

            {renderItem(item, (patch) => update(index, patch), index)}
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={() => onChange([...items, createItem()])}
        disabled={items.length >= max}
        className="admin-btn-ghost w-full justify-center border border-dashed border-[var(--admin-line)] disabled:opacity-40"
        data-test-id={`${testId}-add`}
      >
        <Plus size={14} aria-hidden="true" />
        {addLabel}
      </button>
    </div>
  );
}

function IconBtn({
  label,
  onClick,
  disabled,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={
        'rounded p-1.5 disabled:opacity-30 ' +
        (danger ? 'text-[var(--admin-danger)] hover:bg-red-500/10' : 'hover:bg-white/5')
      }
    >
      {children}
    </button>
  );
}

/** Compact labelled input used across the per-item forms. */
export function MiniField({
  label,
  value,
  onChange,
  placeholder,
  ltr,
  type = 'text',
}: {
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  placeholder?: string;
  ltr?: boolean;
  type?: 'text' | 'number';
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-[var(--admin-text-secondary)]">{label}</span>
      <input
        type={type}
        dir={ltr ? 'ltr' : undefined}
        className={'admin-input py-2 text-sm' + (ltr ? ' text-start' : '')}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

/** Single-choice sibling of MiniField, for a one-of-N field inside an item. */
export function MiniSelect({
  label,
  value,
  options,
  onChange,
  testId,
}: {
  label: string;
  value: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  onChange: (value: string) => void;
  testId?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-[var(--admin-text-secondary)]">{label}</span>
      <select
        className="admin-input py-2 text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        data-test-id={testId}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Multi-select rendered as toggle chips — clearer than a native multiple. */
export function ChipSelect<T extends string>({
  label,
  options,
  selected,
  onChange,
  labels,
}: {
  label: string;
  options: readonly T[];
  selected: readonly T[];
  onChange: (next: T[]) => void;
  labels?: Record<string, string>;
}) {
  return (
    <fieldset>
      <legend className="mb-2 text-xs text-[var(--admin-text-secondary)]">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const on = selected.includes(option);
          return (
            <button
              key={option}
              type="button"
              aria-pressed={on}
              onClick={() =>
                onChange(on ? selected.filter((s) => s !== option) : [...selected, option])
              }
              className={
                'rounded-full border px-3 py-1 text-xs transition-colors ' +
                (on
                  ? 'border-[var(--admin-primary)] bg-[var(--admin-primary-muted)] text-[var(--admin-primary)]'
                  : 'border-[var(--admin-line)] text-[var(--admin-text-secondary)] hover:bg-white/5')
              }
            >
              {labels?.[option] ?? option}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
