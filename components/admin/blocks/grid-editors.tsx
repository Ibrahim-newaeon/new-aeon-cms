// components/admin/blocks/grid-editors.tsx
'use client';

import { Plus, Trash2 } from 'lucide-react';
import { ItemsEditor, MiniField } from './items-editor';
import { registeredCustomBlocks } from '@/lib/blocks/custom-registry';
import type { ContentBlock } from '@/lib/blocks/types';
import { useT } from '../i18n-provider';

type Of<T extends ContentBlock['type']> = Extract<ContentBlock, { type: T }>;

/** 2D grid editor: add/remove rows and columns, edit each cell. */
export function TableEditor({
  block,
  onChange,
}: {
  block: Of<'table'>;
  onChange: (b: Of<'table'>) => void;
}) {
  const t = useT();
  const data = block.data;

  const commit = (next: string[][]) =>
    onChange({
      ...block,
      data: next,
      rows: next.length,
      cols: next[0]?.length ?? 0,
    });

  const setCell = (r: number, c: number, value: string) =>
    commit(data.map((row, ri) => (ri === r ? row.map((cell, ci) => (ci === c ? value : cell)) : row)));

  const addRow = () => commit([...data, Array.from({ length: block.cols || 1 }, () => '')]);
  const removeRow = (r: number) => commit(data.filter((_, i) => i !== r));
  const addCol = () => commit(data.map((row) => [...row, '']));
  const removeCol = (c: number) => commit(data.map((row) => row.filter((_, i) => i !== c)));

  return (
    <div className="space-y-3" data-test-id="table-editor">
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={block.headerRow ?? false}
          onChange={(e) => onChange({ ...block, headerRow: e.target.checked })}
        />
        {t('grid.firstRowHeader')}
      </label>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <tbody>
            {data.map((row, r) => (
              <tr key={r}>
                {row.map((cell, c) => (
                  <td key={c} className="border border-[var(--admin-line)] p-1">
                    <input
                      type="text"
                      aria-label={t('grid.cell', { r: r + 1, c: c + 1 })}
                      className="admin-input py-1.5 text-xs"
                      value={cell}
                      onChange={(e) => setCell(r, c, e.target.value)}
                    />
                  </td>
                ))}
                <td className="p-1">
                  <button
                    type="button"
                    onClick={() => removeRow(r)}
                    aria-label={t('grid.deleteRow', { n: r + 1 })}
                    className="rounded p-1.5 text-[var(--admin-danger)] hover:bg-red-500/10"
                  >
                    <Trash2 size={14} aria-hidden="true" />
                  </button>
                </td>
              </tr>
            ))}
            <tr>
              {(data[0] ?? []).map((_, c) => (
                <td key={c} className="p-1 text-center">
                  <button
                    type="button"
                    onClick={() => removeCol(c)}
                    aria-label={t('grid.deleteColumn', { n: c + 1 })}
                    className="rounded p-1 text-xs text-[var(--admin-danger)] hover:bg-red-500/10"
                  >
                    {t('grid.deleteColumnLabel')}
                  </button>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <div className="flex gap-2">
        <button type="button" onClick={addRow} className="admin-btn-ghost flex-1 justify-center text-xs">
          <Plus size={14} aria-hidden="true" /> {t('common.row')}
        </button>
        <button type="button" onClick={addCol} className="admin-btn-ghost flex-1 justify-center text-xs">
          <Plus size={14} aria-hidden="true" /> {t('common.column')}
        </button>
      </div>
    </div>
  );
}

export function PricingEditor({
  block,
  onChange,
}: {
  block: Of<'pricing'>;
  onChange: (b: Of<'pricing'>) => void;
}) {
  const t = useT();
  return (
    <ItemsEditor
      items={block.plans}
      testId="pricing"
      addLabel={t('grid.addPlan')}
      emptyLabel={t('grid.noPlans')}
      max={6}
      createItem={() => ({ name: '', price: '', features: [], cta: { text: '', url: '' } })}
      onChange={(plans) => onChange({ ...block, plans })}
      renderItem={(plan, update) => (
        <div className="space-y-2">
          <div className="grid gap-2 sm:grid-cols-2">
            <MiniField label={t('common.name')} value={plan.name} onChange={(v) => update({ name: v })} />
            <MiniField label={t('grid.planPrice')} ltr value={plan.price} onChange={(v) => update({ price: v })} />
            <MiniField
              label={t('grid.planPeriod')}
              value={plan.period ?? ''}
              onChange={(v) => update({ period: v || undefined })}
            />
            <MiniField
              label={t('grid.buttonText')}
              value={plan.cta.text}
              onChange={(v) => update({ cta: { ...plan.cta, text: v } })}
            />
          </div>

          <MiniField
            label={t('grid.buttonUrl')}
            ltr
            value={plan.cta.url}
            onChange={(v) => update({ cta: { ...plan.cta, url: v } })}
          />

          {/* features is string[]; edited as one-per-line to avoid a nested
              list-of-lists editor. */}
          <label className="block">
            <span className="mb-1 block text-xs text-[var(--admin-text-secondary)]">
              {t('grid.features')}
            </span>
            <textarea
              rows={4}
              className="admin-input py-2 text-sm resize-y"
              value={plan.features.join('\n')}
              onChange={(e) =>
                update({ features: e.target.value.split('\n').filter((l) => l.trim().length > 0) })
              }
            />
          </label>

          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={plan.highlighted ?? false}
              onChange={(e) => update({ highlighted: e.target.checked })}
            />
            {t('grid.highlight')}
          </label>
        </div>
      )}
    />
  );
}

export function ComparisonEditor({
  block,
  onChange,
}: {
  block: Of<'comparison'>;
  onChange: (b: Of<'comparison'>) => void;
}) {
  const t = useT();
  return (
    <div className="space-y-3" data-test-id="comparison-editor">
      <label className="block">
        <span className="mb-1 block text-xs text-[var(--admin-text-secondary)]">
          {t('grid.columns')}
        </span>
        <textarea
          rows={3}
          className="admin-input py-2 text-sm resize-y"
          value={block.columns.join('\n')}
          onChange={(e) =>
            onChange({
              ...block,
              columns: e.target.value.split('\n').filter((l) => l.trim().length > 0),
            })
          }
        />
      </label>

      <ItemsEditor
        items={block.items}
        testId="comparison"
        addLabel={t('grid.addFeature')}
        emptyLabel={t('grid.noFeatures')}
        createItem={() => ({ feature: '', values: {} })}
        onChange={(items) => onChange({ ...block, items })}
        renderItem={(row, update) => (
          <div className="space-y-2">
            <MiniField
              label={t('grid.feature')}
              value={row.feature}
              onChange={(v) => update({ feature: v })}
            />
            {block.columns.map((col) => {
              const raw = row.values[col];
              return (
                <MiniField
                  key={col}
                  label={col}
                  value={typeof raw === 'boolean' ? (raw ? t('common.yes') : t('common.no')) : (raw ?? '')}
                  onChange={(v) =>
                    update({
                      // The yes/no words round-trip to the union's boolean form, so the
              // parse below must compare against the same translated strings.
                      values: {
                        ...row.values,
                        [col]: v === t('common.yes') ? true : v === t('common.no') ? false : v,
                      },
                    })
                  }
                />
              );
            })}
            {block.columns.length === 0 && (
              <p className="text-xs text-[var(--admin-text-muted)]">{t('grid.addColumnsFirst')}</p>
            )}
          </div>
        )}
      />
    </div>
  );
}

export function ProductGridEditor({
  block,
  onChange,
}: {
  block: Of<'product-grid'>;
  onChange: (b: Of<'product-grid'>) => void;
}) {
  const t = useT();
  return (
    <div className="space-y-3">
      <label className="block">
        <span className="mb-1 block text-xs text-[var(--admin-text-secondary)]">
          {t('grid.productIds')}
        </span>
        <textarea
          rows={4}
          dir="ltr"
          className="admin-input py-2 text-xs font-mono resize-y text-start"
          value={block.productIds.join('\n')}
          onChange={(e) =>
            onChange({
              ...block,
              productIds: e.target.value.split('\n').map((l) => l.trim()).filter(Boolean),
            })
          }
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-xs text-[var(--admin-text-secondary)]">{t('grid.layout')}</span>
        <select
          className="admin-input"
          value={block.layout}
          onChange={(e) => onChange({ ...block, layout: e.target.value as typeof block.layout })}
        >
          <option value="grid">{t('grid.layoutGrid')}</option>
          <option value="list">{t('grid.layoutList')}</option>
          <option value="carousel">{t('grid.layoutCarousel')}</option>
        </select>
      </label>

      <p className="text-xs text-[var(--admin-text-muted)]">
        {t('grid.commerceOnly')}
      </p>
    </div>
  );
}

export function CustomEditor({
  block,
  onChange,
}: {
  block: Of<'custom'>;
  onChange: (b: Of<'custom'>) => void;
}) {
  const t = useT();
  const available = registeredCustomBlocks();

  return (
    <div className="space-y-3">
      <label className="block">
        <span className="mb-1 block text-xs text-[var(--admin-text-secondary)]">{t('grid.componentName')}</span>
        {available.length > 0 ? (
          <select
            className="admin-input"
            value={block.component}
            onChange={(e) => onChange({ ...block, component: e.target.value })}
          >
            <option value="">—</option>
            {available.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        ) : (
          <input
            type="text"
            dir="ltr"
            className="admin-input text-start"
            value={block.component}
            onChange={(e) => onChange({ ...block, component: e.target.value })}
          />
        )}
      </label>

      {available.length === 0 && (
        <p className="text-xs text-[var(--admin-warning)]">
          {t('grid.noComponents')}
        </p>
      )}

      <PropsEditor value={block.props} onChange={(props) => onChange({ ...block, props })} />
    </div>
  );
}

function PropsEditor({
  value,
  onChange,
}: {
  value: Record<string, unknown>;
  onChange: (value: Record<string, unknown>) => void;
}) {
  const t = useT();
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-[var(--admin-text-secondary)]">{t('grid.propsJson')}</span>
      <textarea
        rows={5}
        dir="ltr"
        className="admin-input py-2 text-xs font-mono resize-y text-start"
        defaultValue={JSON.stringify(value, null, 2)}
        onBlur={(e) => {
          // Parsed on blur, not on every keystroke — otherwise half-typed JSON
          // is rejected on each character.
          try {
            const parsed = JSON.parse(e.target.value || '{}');
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
              onChange(parsed as Record<string, unknown>);
            }
          } catch {
            /* leave the previous valid value in place */
          }
        }}
      />
    </label>
  );
}
