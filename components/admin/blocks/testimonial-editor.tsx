// components/admin/blocks/testimonial-editor.tsx
'use client';

import { useState } from 'react';
import { Plus, Trash2, ChevronUp, ChevronDown, Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MediaField } from '../media-field';
import {
  testimonialBlockSchema,
  EMPTY_TESTIMONIAL_ITEM,
  type TestimonialBlockInput,
  type TestimonialItemInput,
} from '@/lib/blocks/testimonial';
import { useT } from '../i18n-provider';

interface TestimonialEditorProps {
  value: TestimonialBlockInput;
  onChange: (block: TestimonialBlockInput) => void;
}

/** field path -> message, e.g. "items.0.quote" */
type FieldErrors = Record<string, string>;

export function TestimonialEditor({ value, onChange }: TestimonialEditorProps) {
  const t = useT();
  const [errors, setErrors] = useState<FieldErrors>({});

  const commit = (next: TestimonialBlockInput) => {
    const result = testimonialBlockSchema.safeParse(next);
    if (result.success) {
      setErrors({});
    } else {
      const collected: FieldErrors = {};
      for (const issue of result.error.issues) {
        collected[issue.path.join('.')] = issue.message;
      }
      setErrors(collected);
    }
    // Always propagate: the editor keeps invalid drafts on screen; the save
    // handler is responsible for blocking publish on invalid blocks.
    onChange(next);
  };

  const updateItem = (index: number, patch: Partial<TestimonialItemInput>) => {
    const items = value.items.map((item, i) => (i === index ? { ...item, ...patch } : item));
    commit({ ...value, items });
  };

  const addItem = () => commit({ ...value, items: [...value.items, { ...EMPTY_TESTIMONIAL_ITEM }] });

  const removeItem = (index: number) =>
    commit({ ...value, items: value.items.filter((_, i) => i !== index) });

  const moveItem = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= value.items.length) return;
    const items = [...value.items];
    // Explicit reads: `noUncheckedIndexedAccess` types items[i] as
    // `T | undefined`, so a destructured swap does not type-check.
    const current = items[index];
    const neighbour = items[target];
    if (!current || !neighbour) return;
    items[index] = neighbour;
    items[target] = current;
    commit({ ...value, items });
  };

  return (
    <div className="admin-card space-y-4" data-test-id="testimonial-editor">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-medium text-[var(--admin-text)]">{t('testimonial.title')}</h3>

        <label className="flex items-center gap-2 text-xs text-[var(--admin-text-secondary)]">
          <span>{t('testimonial.columns')}</span>
          <select
            className="admin-input w-auto py-1.5"
            value={value.columns}
            onChange={(e) => commit({ ...value, columns: Number(e.target.value) as 1 | 2 | 3 })}
            aria-label={t('testimonial.columnCount')}
            data-test-id="testimonial-columns"
          >
            <option value={1}>1</option>
            <option value={2}>2</option>
            <option value={3}>3</option>
          </select>
        </label>
      </div>

      {errors['items'] && (
        <p role="alert" className="text-xs text-[var(--admin-danger)]">
          {errors['items']}
        </p>
      )}

      <ul className="space-y-4">
        {value.items.map((item, index) => (
          <li
            key={index}
            className="rounded-md border border-[var(--admin-line)] bg-[var(--admin-elevated)] p-4 space-y-3"
            data-test-id={`testimonial-editor-item-${index}`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-[var(--admin-text-muted)]">
                {t('testimonial.itemN')} <span dir="ltr">{index + 1}</span>
              </span>

              <div className="flex items-center gap-1">
                <IconButton
                  label={t('testimonial.moveUp', { n: index + 1 })}
                  disabled={index === 0}
                  onClick={() => moveItem(index, -1)}
                  testId={`testimonial-move-up-${index}`}
                >
                  <ChevronUp size={16} />
                </IconButton>
                <IconButton
                  label={t('testimonial.moveDown', { n: index + 1 })}
                  disabled={index === value.items.length - 1}
                  onClick={() => moveItem(index, 1)}
                  testId={`testimonial-move-down-${index}`}
                >
                  <ChevronDown size={16} />
                </IconButton>
                <IconButton
                  label={t('testimonial.delete', { n: index + 1 })}
                  onClick={() => removeItem(index)}
                  danger
                  testId={`testimonial-remove-${index}`}
                >
                  <Trash2 size={16} />
                </IconButton>
              </div>
            </div>

            <Field label={t('testimonial.quote')} error={errors[`items.${index}.quote`]} required>
              <textarea
                rows={3}
                className="admin-input resize-y"
                value={item.quote}
                onChange={(e) => updateItem(index, { quote: e.target.value })}
                placeholder={t('testimonial.quotePlaceholder')}
                data-test-id={`testimonial-quote-${index}`}
              />
            </Field>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t('testimonial.author')} error={errors[`items.${index}.author`]} required>
                <input
                  type="text"
                  className="admin-input"
                  value={item.author}
                  onChange={(e) => updateItem(index, { author: e.target.value })}
                  data-test-id={`testimonial-author-${index}`}
                />
              </Field>

              <Field label={t('testimonial.role')} error={errors[`items.${index}.role`]}>
                <input
                  type="text"
                  className="admin-input"
                  value={item.role ?? ''}
                  onChange={(e) => updateItem(index, { role: e.target.value || undefined })}
                  data-test-id={`testimonial-role-${index}`}
                />
              </Field>
            </div>

            <MediaField
              label={t('testimonial.avatar')}
              value={item.avatar ?? ''}
              onChange={(v) => updateItem(index, { avatar: v || undefined })}
              testId={`testimonial-avatar-${index}`}
            />

            <Field label={t('testimonial.rating')} error={errors[`items.${index}.rating`]}>
              <RatingInput
                index={index}
                value={item.rating}
                onChange={(rating) => updateItem(index, { rating })}
              />
            </Field>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={addItem}
        className="admin-btn-ghost w-full justify-center border border-dashed border-[var(--admin-line)]"
        data-test-id="testimonial-add-item"
      >
        <Plus size={16} />
        {t('testimonial.add')}
      </button>
    </div>
  );
}

function Field({
  label,
  error,
  required,
  children,
}: {
  label: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs text-[var(--admin-text-secondary)]">
        {label}
        {required && <span className="text-[var(--admin-danger)] ms-1">*</span>}
      </span>
      {children}
      {error && (
        <span role="alert" className="block text-xs text-[var(--admin-danger)]">
          {error}
        </span>
      )}
    </label>
  );
}

function RatingInput({
  index,
  value,
  onChange,
}: {
  index: number;
  value?: number;
  onChange: (rating: number | undefined) => void;
}) {
  const t = useT();
  return (
    <div dir="ltr" className="flex items-center gap-1" data-test-id={`testimonial-rating-${index}`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          // Clicking the active star clears the rating (it is optional).
          onClick={() => onChange(value === star ? undefined : star)}
          aria-label={t('testimonial.ratingStar', { star })}
          aria-pressed={value !== undefined && star <= value}
          className="rounded p-1 transition-colors hover:bg-white/5 focus:outline-none focus:ring-2 focus:ring-[var(--admin-primary)]"
        >
          <Star
            size={18}
            className={cn(
              value !== undefined && star <= value
                ? 'fill-amber-400 text-amber-400'
                : 'fill-none text-[var(--admin-text-muted)]'
            )}
          />
        </button>
      ))}
    </div>
  );
}

function IconButton({
  label,
  onClick,
  children,
  disabled,
  danger,
  testId,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
  danger?: boolean;
  testId: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      data-test-id={testId}
      className={cn(
        'rounded p-2 transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--admin-primary)]',
        'disabled:opacity-40 disabled:cursor-not-allowed',
        danger
          ? 'text-[var(--admin-danger)] hover:bg-[var(--admin-danger)]/10'
          : 'text-[var(--admin-text-secondary)] hover:bg-white/5 hover:text-[var(--admin-text)]'
      )}
    >
      {children}
    </button>
  );
}
