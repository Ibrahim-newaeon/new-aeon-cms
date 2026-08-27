// components/admin/block-builder.tsx
'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Plus, GripVertical, Trash2, ChevronDown, ChevronUp, X } from 'lucide-react';
import {
  DndContext, KeyboardSensor, PointerSensor, closestCenter,
  useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, sortableKeyboardCoordinates, useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cn } from '@/lib/utils';
import { RichTextBlockEditor } from './rich-text-block-editor';
import { BlockEditor } from './block-editors';
import {
  ALL_BLOCK_TYPES, BLOCK_LABELS, EDITABLE_BLOCKS, createDefaultBlock,
  type BlockType,
} from '@/lib/blocks/defaults';
import type { ContentBlock } from '@/lib/blocks/types';

interface BlockBuilderProps {
  blocks: ContentBlock[];
  onChange: (blocks: ContentBlock[]) => void;
}

let keyCounter = 0;
const nextKey = () => `blk-${(keyCounter += 1)}`;

export function BlockBuilder({ blocks, onChange }: BlockBuilderProps) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  /**
   * Stable per-block keys. Using the array index as a React key means that
   * reordering or deleting re-associates component state with the wrong block —
   * a TipTap editor would keep the previous block's document.
   */
  const [keys, setKeys] = useState<string[]>(() => blocks.map(nextKey));

  useEffect(() => {
    // Resync if blocks are replaced wholesale (e.g. switching locale tab).
    setKeys((prev) => (prev.length === blocks.length ? prev : blocks.map(nextKey)));
  }, [blocks.length]);

  // Close the picker on outside click or Escape.
  useEffect(() => {
    if (!showAddMenu) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowAddMenu(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowAddMenu(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [showAddMenu]);

  const addBlock = (type: BlockType) => {
    const key = nextKey();
    setKeys((prev) => [...prev, key]);
    onChange([...blocks, createDefaultBlock(type)]);
    setExpanded(key);
    setShowAddMenu(false);
  };

  const updateBlock = (index: number, block: ContentBlock) => {
    onChange(blocks.map((b, i) => (i === index ? block : b)));
  };

  const removeBlock = (index: number) => {
    setKeys((prev) => prev.filter((_, i) => i !== index));
    onChange(blocks.filter((_, i) => i !== index));
  };

  // Pointer sensor with a small activation distance so a click on the header
  // buttons is not swallowed as a drag. Keyboard sensor keeps reordering
  // operable without a mouse.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const from = keys.indexOf(String(active.id));
    const to = keys.indexOf(String(over.id));
    if (from < 0 || to < 0) return;

    const reorder = <T,>(arr: T[]): T[] => {
      const copy = [...arr];
      const [moved] = copy.splice(from, 1);
      if (moved === undefined) return arr;
      copy.splice(to, 0, moved);
      return copy;
    };

    setKeys(reorder);
    onChange(reorder(blocks));
  };

  const moveBlock = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= blocks.length) return;

    // Explicit reads rather than a destructured splice: under
    // noUncheckedIndexedAccess the spliced value is `T | undefined`.
    const swap = <T,>(arr: T[]): T[] => {
      const copy = [...arr];
      const a = copy[index];
      const b = copy[target];
      if (a === undefined || b === undefined) return arr;
      copy[index] = b;
      copy[target] = a;
      return copy;
    };

    setKeys(swap);
    onChange(swap(blocks));
  };

  return (
    <div className="space-y-4" data-test-id="block-builder">
      {blocks.length === 0 && (
        <p className="rounded-lg border border-dashed border-[var(--admin-line)] p-8 text-center text-sm text-[var(--admin-text-muted)]">
          لا توجد أقسام بعد. ابدأ بإضافة قسم.
        </p>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={keys} strategy={verticalListSortingStrategy}>
          <ul className="space-y-4" id={listId}>
            {blocks.map((block, idx) => {
              const key = keys[idx] ?? `fallback-${idx}`;
              return (
                <BlockItem
                  key={key}
                  sortId={key}
                  domId={`${listId}-${key}`}
                  index={idx}
                  total={blocks.length}
                  block={block}
                  isExpanded={expanded === key}
                  onToggle={() => setExpanded(expanded === key ? null : key)}
                  onUpdate={(b) => updateBlock(idx, b)}
                  onRemove={() => removeBlock(idx)}
                  onMove={(dir) => moveBlock(idx, dir)}
                />
              );
            })}
          </ul>
        </SortableContext>
      </DndContext>

      <div className="relative" ref={menuRef}>
        <button
          type="button"
          onClick={() => setShowAddMenu((v) => !v)}
          aria-expanded={showAddMenu}
          aria-haspopup="menu"
          className="admin-btn-primary w-full"
          data-test-id="block-add"
        >
          <Plus size={18} aria-hidden="true" />
          إضافة قسم
        </button>

        {showAddMenu && (
          <div
            role="menu"
            aria-label="أنواع الأقسام"
            className="absolute z-50 mt-2 w-full rounded-lg border border-[var(--admin-line)] bg-[var(--admin-elevated)] shadow-xl max-h-80 overflow-y-auto admin-scroll"
          >
            <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--admin-line)]">
              <span className="text-xs text-[var(--admin-text-muted)]">اختر نوع القسم</span>
              <button
                type="button"
                onClick={() => setShowAddMenu(false)}
                aria-label="إغلاق"
                className="rounded p-1 hover:bg-white/5"
              >
                <X size={14} aria-hidden="true" />
              </button>
            </div>

            <div className="p-2 grid grid-cols-2 gap-1">
              {ALL_BLOCK_TYPES.map((type) => {
                const editable = EDITABLE_BLOCKS.has(type);
                return (
                  <button
                    key={type}
                    type="button"
                    role="menuitem"
                    onClick={() => addBlock(type)}
                    data-test-id={`block-add-${type}`}
                    className="flex items-center justify-between gap-2 rounded px-3 py-2 text-start text-sm transition-colors hover:bg-white/5"
                  >
                    <span>{BLOCK_LABELS[type]}</span>
                    {/* Honest about which pickers lead to a real editor. */}
                    {!editable && (
                      <span className="shrink-0 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-400">
                        قريباً
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function BlockItem({
  sortId,
  domId,
  index,
  total,
  block,
  isExpanded,
  onToggle,
  onUpdate,
  onRemove,
  onMove,
}: {
  sortId: string;
  domId: string;
  index: number;
  total: number;
  block: ContentBlock;
  isExpanded: boolean;
  onToggle: () => void;
  onUpdate: (b: ContentBlock) => void;
  onRemove: () => void;
  onMove: (direction: -1 | 1) => void;
}) {
  return (
    <li className="rounded-lg border border-[var(--admin-line)] bg-[var(--admin-surface)]">
      <div className="flex items-center gap-2 p-3 border-b border-[var(--admin-line)]">
        {/* Decorative only — there is no drag-and-drop yet, so it must not
            look interactive (it previously had cursor-grab). */}
        <GripVertical size={16} aria-hidden="true" className="text-[var(--admin-text-muted)]" />

        <span className="flex-1 text-sm font-medium">
          {BLOCK_LABELS[block.type]}
          <span className="ms-2 text-xs text-[var(--admin-text-muted)]" dir="ltr">
            #{index + 1}
          </span>
        </span>

        {/* These handlers existed in the original but no buttons ever rendered
            them, so blocks could not be reordered at all. */}
        <button
          type="button"
          onClick={() => onMove(-1)}
          disabled={index === 0}
          aria-label={`تحريك القسم ${index + 1} لأعلى`}
          data-test-id={`block-up-${index}`}
          className="rounded p-1.5 hover:bg-white/5 disabled:opacity-30"
        >
          <ChevronUp size={16} aria-hidden="true" />
        </button>

        <button
          type="button"
          onClick={() => onMove(1)}
          disabled={index === total - 1}
          aria-label={`تحريك القسم ${index + 1} لأسفل`}
          data-test-id={`block-down-${index}`}
          className="rounded p-1.5 hover:bg-white/5 disabled:opacity-30"
        >
          <ChevronDown size={16} aria-hidden="true" />
        </button>

        <button
          type="button"
          onClick={onToggle}
          aria-expanded={isExpanded}
          aria-controls={domId}
          aria-label={isExpanded ? 'طي القسم' : 'توسيع القسم'}
          data-test-id={`block-toggle-${index}`}
          className="rounded p-1.5 hover:bg-white/5"
        >
          <ChevronDown
            size={16}
            aria-hidden="true"
            className={cn('transition-transform', isExpanded && 'rotate-180')}
          />
        </button>

        <button
          type="button"
          onClick={onRemove}
          aria-label={`حذف القسم ${index + 1}`}
          data-test-id={`block-remove-${index}`}
          className="rounded p-1.5 text-red-400 hover:bg-red-500/10"
        >
          <Trash2 size={16} aria-hidden="true" />
        </button>
      </div>

      {isExpanded && (
        <div id={domId} className="p-4">
          {block.type === 'rich-text' ? (
            <RichTextBlockEditor block={block} onChange={onUpdate} />
          ) : block.type === 'accordion' ? (
            <NestedBlocksEditor
              entries={block.items}
              labelKey="title"
              labelText="عنوان العنصر"
              addLabel="إضافة عنصر"
              onChange={(items) => onUpdate({ ...block, items })}
            />
          ) : block.type === 'tabs' ? (
            <NestedBlocksEditor
              entries={block.items}
              labelKey="label"
              labelText="اسم التبويب"
              addLabel="إضافة تبويب"
              onChange={(items) => onUpdate({ ...block, items })}
            />
          ) : (
            <BlockEditor block={block} onChange={onUpdate} />
          )}
        </div>
      )}
    </li>
  );
}

/**
 * accordion and tabs nest ContentBlock[], so their editor recurses into
 * BlockBuilder.
 *
 * This lives in block-builder.tsx rather than block-editors.tsx on purpose:
 * block-builder already imports block-editors, so putting it there would make
 * the two modules import each other.
 */
function NestedBlocksEditor<K extends 'title' | 'label'>({
  entries,
  labelKey,
  labelText,
  addLabel,
  onChange,
}: {
  entries: Array<{ content: ContentBlock[] } & Record<K, string>>;
  labelKey: K;
  labelText: string;
  addLabel: string;
  onChange: (entries: Array<{ content: ContentBlock[] } & Record<K, string>>) => void;
}) {
  const update = (
    index: number,
    patch: Partial<{ content: ContentBlock[] } & Record<K, string>>
  ) => onChange(entries.map((e, i) => (i === index ? { ...e, ...patch } : e)));

  return (
    <div className="space-y-3" data-test-id="nested-blocks-editor">
      {entries.map((entry, index) => (
        <div
          key={index}
          className="space-y-3 rounded-md border border-[var(--admin-line)] bg-[var(--admin-elevated)] p-3"
        >
          <div className="flex items-end gap-2">
            <label className="block flex-1">
              <span className="mb-1 block text-xs text-[var(--admin-text-secondary)]">
                {labelText}
              </span>
              <input
                type="text"
                className="admin-input py-2 text-sm"
                value={entry[labelKey]}
                onChange={(e) =>
                  update(index, { [labelKey]: e.target.value } as Partial<
                    { content: ContentBlock[] } & Record<K, string>
                  >)
                }
                data-test-id={`nested-label-${index}`}
              />
            </label>
            <button
              type="button"
              onClick={() => onChange(entries.filter((_, i) => i !== index))}
              aria-label={`حذف ${index + 1}`}
              className="rounded p-2 text-[var(--admin-danger)] hover:bg-red-500/10"
            >
              <Trash2 size={16} aria-hidden="true" />
            </button>
          </div>

          <div className="border-s-2 border-[var(--admin-line)] ps-3">
            <BlockBuilder
              blocks={entry.content}
              onChange={(content) =>
                update(index, { content } as Partial<
                  { content: ContentBlock[] } & Record<K, string>
                >)
              }
            />
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={() =>
          onChange([
            ...entries,
            { [labelKey]: '', content: [] } as unknown as {
              content: ContentBlock[];
            } & Record<K, string>,
          ])
        }
        className="admin-btn-ghost w-full justify-center border border-dashed border-[var(--admin-line)]"
        data-test-id="nested-add"
      >
        <Plus size={14} aria-hidden="true" />
        {addLabel}
      </button>
    </div>
  );
}
