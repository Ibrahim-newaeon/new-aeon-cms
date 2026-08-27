// components/admin/navigation-manager.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  DndContext, KeyboardSensor, PointerSensor, closestCenter,
  useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, sortableKeyboardCoordinates, useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Plus, Trash2, Pencil, X, GripVertical, Loader2, ExternalLink, CornerDownLeft,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { navLocations, type NavLocation } from '@/lib/navigation-schema';

export interface NavRow {
  id: string;
  label: string;
  labelAr: string;
  labelEn: string;
  url: string;
  location: NavLocation;
  parentId: string | null;
  order: number;
  isActive: boolean;
  openInNew: boolean;
}

type Draft = Omit<NavRow, 'id'>;

const LOCATION_LABEL: Record<NavLocation, string> = {
  header: 'القائمة العلوية',
  footer: 'التذييل',
  sidebar: 'القائمة الجانبية',
  mobile: 'قائمة الجوال',
};

const emptyDraft = (location: NavLocation): Draft => ({
  label: '',
  labelAr: '',
  labelEn: '',
  url: '',
  location,
  parentId: null,
  order: 0,
  isActive: true,
  openInNew: false,
});

export function NavigationManager({ initial }: { initial: NavRow[] }) {
  const router = useRouter();
  const [rows, setRows] = useState(initial);
  const [location, setLocation] = useState<NavLocation>('header');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft('header'));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const inLocation = rows.filter((r) => r.location === location);
  // Children render under their parent; ordering within the location is by `order`.
  const ordered = inLocation
    .filter((r) => !r.parentId)
    .flatMap((p) => [p, ...inLocation.filter((c) => c.parentId === p.id)]);

  const payload = (d: Draft) => ({
    label: d.label,
    url: d.url,
    location: d.location,
    parentId: d.parentId,
    order: d.order,
    isActive: d.isActive,
    openInNew: d.openInNew,
    translations: [
      { locale: 'ar' as const, label: d.labelAr },
      { locale: 'en' as const, label: d.labelEn },
    ],
  });

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(editingId ? `/api/navigation/${editingId}` : '/api/navigation', {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(payload(draft)),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        throw new Error(data?.error?.issues?.[0]?.message ?? data?.error?.message ?? 'تعذّر الحفظ');
      }
      setCreating(false);
      setEditingId(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذّر الحفظ');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (row: NavRow) => {
    if (!window.confirm('سيُحذف العنصر. العناصر الفرعية ستُنقل إلى المستوى الأعلى. متابعة؟')) return;
    const res = await fetch(`/api/navigation/${row.id}`, {
      method: 'DELETE',
      credentials: 'same-origin',
    });
    if (res.ok) {
      setRows((p) => p.filter((r) => r.id !== row.id));
      router.refresh();
    }
  };

  const onDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const ids = ordered.map((r) => r.id);
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;

    const next = [...ids];
    const [moved] = next.splice(from, 1);
    if (moved === undefined) return;
    next.splice(to, 0, moved);

    // Optimistic: reflect the new order immediately, then persist.
    setRows((prev) =>
      prev.map((r) => (next.includes(r.id) ? { ...r, order: next.indexOf(r.id) } : r))
    );

    await fetch('/api/navigation', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ location, ids: next }),
    });
    router.refresh();
  };

  const editorOpen = creating || editingId !== null;

  return (
    <div className="space-y-5" data-test-id="navigation-manager">
      <div role="tablist" aria-label="مواقع القوائم" className="flex flex-wrap gap-1 border-b border-[var(--admin-line)]">
        {navLocations.map((loc) => (
          <button
            key={loc}
            type="button"
            role="tab"
            aria-selected={location === loc}
            onClick={() => {
              setLocation(loc);
              setCreating(false);
              setEditingId(null);
            }}
            data-test-id={`nav-tab-${loc}`}
            className={cn(
              'border-b-2 px-4 py-2 text-sm transition-colors',
              location === loc
                ? 'border-[var(--admin-accent)] text-[var(--admin-accent-soft)]'
                : 'border-transparent text-[var(--admin-text-secondary)] hover:text-[var(--admin-text)]'
            )}
          >
            {LOCATION_LABEL[loc]}
            <span className="ms-2 text-xs text-[var(--admin-text-muted)]" dir="ltr">
              {rows.filter((r) => r.location === loc).length}
            </span>
          </button>
        ))}
      </div>

      {!editorOpen && (
        <button
          type="button"
          onClick={() => {
            setDraft(emptyDraft(location));
            setCreating(true);
            setError(null);
          }}
          className="admin-btn"
          data-test-id="nav-new"
        >
          <Plus size={16} aria-hidden="true" />
          عنصر جديد
        </button>
      )}

      {editorOpen && (
        <div className="admin-card space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-medium">{editingId ? 'تعديل العنصر' : 'عنصر جديد'}</h2>
            <button
              type="button"
              onClick={() => {
                setCreating(false);
                setEditingId(null);
              }}
              aria-label="إغلاق"
              className="rounded p-1.5 hover:bg-white/5"
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="الاسم المرجعي" hint="يُستخدم إذا لم تُضف ترجمة للغة ما.">
              <input
                className="admin-input"
                value={draft.label}
                onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))}
                data-test-id="nav-label"
              />
            </Field>

            <Field label="الرابط" hint="مسار داخلي مثل /ar/about أو رابط خارجي.">
              <input
                className="admin-input text-start"
                dir="ltr"
                value={draft.url}
                onChange={(e) => setDraft((d) => ({ ...d, url: e.target.value }))}
                placeholder="/about"
                data-test-id="nav-url"
              />
            </Field>

            <Field label="النص (عربي)">
              <input
                className="admin-input"
                value={draft.labelAr}
                onChange={(e) => setDraft((d) => ({ ...d, labelAr: e.target.value }))}
                data-test-id="nav-label-ar"
              />
            </Field>

            <Field label="Label (English)">
              <input
                className="admin-input text-start"
                dir="ltr"
                value={draft.labelEn}
                onChange={(e) => setDraft((d) => ({ ...d, labelEn: e.target.value }))}
                data-test-id="nav-label-en"
              />
            </Field>

            <Field label="العنصر الأب">
              <select
                className="admin-input"
                value={draft.parentId ?? ''}
                onChange={(e) => setDraft((d) => ({ ...d, parentId: e.target.value || null }))}
                data-test-id="nav-parent"
              >
                <option value="">— بدون —</option>
                {inLocation
                  .filter((r) => r.id !== editingId && !r.parentId)
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.labelAr || r.label}
                    </option>
                  ))}
              </select>
            </Field>

            <Field label="الموقع">
              <select
                className="admin-input"
                value={draft.location}
                onChange={(e) => setDraft((d) => ({ ...d, location: e.target.value as NavLocation }))}
              >
                {navLocations.map((loc) => (
                  <option key={loc} value={loc}>
                    {LOCATION_LABEL[loc]}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="flex flex-wrap gap-5">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={draft.isActive}
                onChange={(e) => setDraft((d) => ({ ...d, isActive: e.target.checked }))}
                data-test-id="nav-active"
              />
              مفعّل
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={draft.openInNew}
                onChange={(e) => setDraft((d) => ({ ...d, openInNew: e.target.checked }))}
              />
              فتح في نافذة جديدة
            </label>
          </div>

          {error && (
            <p role="alert" className="text-sm text-[var(--admin-danger)]">
              {error}
            </p>
          )}

          <button type="button" onClick={() => void submit()} disabled={busy} className="admin-btn" data-test-id="nav-save">
            {busy && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
            حفظ
          </button>
        </div>
      )}

      {ordered.length === 0 ? (
        <p className="admin-card py-12 text-center text-sm text-[var(--admin-text-muted)]">
          لا توجد عناصر في {LOCATION_LABEL[location]}.
        </p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={ordered.map((r) => r.id)} strategy={verticalListSortingStrategy}>
            <ul className="admin-card divide-y divide-[var(--admin-line)] p-0">
              {ordered.map((row) => (
                <NavItem
                  key={row.id}
                  row={row}
                  onEdit={() => {
                    const { id, ...rest } = row;
                    void id;
                    setDraft(rest);
                    setEditingId(row.id);
                    setCreating(false);
                    setError(null);
                  }}
                  onRemove={() => void remove(row)}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}

function NavItem({
  row,
  onEdit,
  onRemove,
}: {
  row: NavRow;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: row.id,
  });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'flex flex-wrap items-center gap-3 p-4',
        row.parentId && 'ps-10',
        isDragging && 'opacity-80'
      )}
      data-test-id={`nav-item-${row.id}`}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label={`إعادة ترتيب ${row.label}`}
        className="cursor-grab touch-none rounded p-1 text-[var(--admin-text-muted)] hover:bg-white/5 active:cursor-grabbing"
      >
        <GripVertical size={16} aria-hidden="true" />
      </button>

      {row.parentId && <CornerDownLeft size={14} aria-hidden="true" className="text-[var(--admin-text-muted)]" />}

      <span className="flex-1 text-sm font-medium">{row.labelAr || row.label}</span>
      <span className="flex-1 text-sm text-[var(--admin-text-muted)]" dir="ltr">
        {row.labelEn || '—'}
      </span>
      <span className="text-xs text-[var(--admin-text-muted)]" dir="ltr">
        {row.url}
      </span>

      {row.openInNew && <ExternalLink size={13} aria-hidden="true" className="text-[var(--admin-text-muted)]" />}
      {!row.isActive && (
        <span className="rounded-full bg-white/5 px-2 py-0.5 text-[11px] text-[var(--admin-text-muted)]">معطّل</span>
      )}

      <button type="button" onClick={onEdit} aria-label={`تعديل ${row.label}`} className="rounded p-2 text-[var(--admin-text-secondary)] hover:bg-white/5">
        <Pencil size={16} aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`حذف ${row.label}`}
        className="rounded p-2 text-[var(--admin-danger)] hover:bg-red-500/10"
        data-test-id={`nav-delete-${row.id}`}
      >
        <Trash2 size={16} aria-hidden="true" />
      </button>
    </li>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-[var(--admin-text-secondary)]">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-[var(--admin-text-muted)]">{hint}</span>}
    </label>
  );
}
