// components/admin/tags-manager.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, Check, X, Pencil, Loader2 } from 'lucide-react';
import { slugify } from '@/lib/taxonomy-schema';

export interface TagRow {
  id: string;
  slug: string;
  name: string;
  usageCount: number;
}

/**
 * Tags are two fields, so they are edited in place. Sending the author to a
 * separate form page for a name and a slug would be more navigation than data.
 */
export function TagsManager({ initial }: { initial: TagRow[] }) {
  const router = useRouter();
  const [rows, setRows] = useState(initial);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ name: string; slug: string }>({ name: '', slug: '' });

  const onNameChange = (v: string) => {
    setName(v);
    // Auto-derive only until the author edits the slug themselves.
    if (!slugTouched) setSlug(slugify(v));
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ name, slug }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        throw new Error(data?.error?.issues?.[0]?.message ?? data?.error?.message ?? 'تعذّر الحفظ');
      }
      setRows((p) => [{ ...(data.data as TagRow), usageCount: 0 }, ...p]);
      setName('');
      setSlug('');
      setSlugTouched(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذّر الحفظ');
    } finally {
      setBusy(false);
    }
  };

  const save = async (id: string) => {
    const res = await fetch(`/api/tags/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(draft),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.success) {
      setError(data?.error?.message ?? 'تعذّر الحفظ');
      return;
    }
    setRows((p) => p.map((r) => (r.id === id ? { ...r, ...draft } : r)));
    setEditing(null);
  };

  const remove = async (row: TagRow) => {
    const msg =
      row.usageCount > 0
        ? `هذا الوسم مرتبط بـ ${row.usageCount} عنصر. سيُزال منها. متابعة؟`
        : 'سيُحذف الوسم نهائياً. متابعة؟';
    if (!window.confirm(msg)) return;

    const res = await fetch(`/api/tags/${row.id}`, {
      method: 'DELETE',
      credentials: 'same-origin',
    });
    if (res.ok) setRows((p) => p.filter((r) => r.id !== row.id));
  };

  return (
    <div className="space-y-5" data-test-id="tags-manager">
      <form onSubmit={create} className="admin-card flex flex-wrap items-end gap-3">
        <label className="min-w-[180px] flex-1">
          <span className="mb-1 block text-xs text-[var(--admin-text-secondary)]">الاسم</span>
          <input
            type="text"
            required
            className="admin-input"
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            data-test-id="tag-name"
          />
        </label>

        <label className="min-w-[180px] flex-1">
          <span className="mb-1 block text-xs text-[var(--admin-text-secondary)]">الرابط</span>
          <input
            type="text"
            dir="ltr"
            required
            className="admin-input text-start"
            value={slug}
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(e.target.value);
            }}
            placeholder="tag-slug"
            data-test-id="tag-slug"
          />
        </label>

        <button type="submit" disabled={busy} className="admin-btn" data-test-id="tag-create">
          {busy ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Plus size={16} aria-hidden="true" />}
          إضافة
        </button>
      </form>

      {name && !slug && (
        <p className="text-xs text-[var(--admin-warning)]">
          الاسم بالعربية لا يُنتج رابطاً تلقائياً — اكتب الرابط بالإنجليزية.
        </p>
      )}

      {error && (
        <p role="alert" className="admin-card border-[var(--admin-danger)] text-sm text-[var(--admin-danger)]">
          {error}
        </p>
      )}

      {rows.length === 0 ? (
        <p className="admin-card py-12 text-center text-sm text-[var(--admin-text-muted)]">
          لا توجد وسوم بعد.
        </p>
      ) : (
        <ul className="admin-card divide-y divide-[var(--admin-line)] p-0">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center gap-3 p-4" data-test-id={`tag-${row.id}`}>
              {editing === row.id ? (
                <>
                  <input
                    className="admin-input flex-1"
                    value={draft.name}
                    onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                    aria-label="الاسم"
                  />
                  <input
                    className="admin-input flex-1 text-start"
                    dir="ltr"
                    value={draft.slug}
                    onChange={(e) => setDraft((d) => ({ ...d, slug: e.target.value }))}
                    aria-label="الرابط"
                  />
                  <button type="button" onClick={() => void save(row.id)} aria-label="حفظ" className="rounded p-2 text-[var(--admin-success)] hover:bg-white/5">
                    <Check size={16} aria-hidden="true" />
                  </button>
                  <button type="button" onClick={() => setEditing(null)} aria-label="إلغاء" className="rounded p-2 hover:bg-white/5">
                    <X size={16} aria-hidden="true" />
                  </button>
                </>
              ) : (
                <>
                  <span className="flex-1 text-sm font-medium">{row.name}</span>
                  <span className="flex-1 text-sm text-[var(--admin-text-muted)]" dir="ltr">
                    {row.slug}
                  </span>
                  <span className="rounded-full bg-[var(--admin-accent-muted)] px-2 py-0.5 text-[11px] text-[var(--admin-accent-soft)]" dir="ltr">
                    {row.usageCount}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(row.id);
                      setDraft({ name: row.name, slug: row.slug });
                    }}
                    aria-label={`تعديل ${row.name}`}
                    className="rounded p-2 text-[var(--admin-text-secondary)] hover:bg-white/5"
                  >
                    <Pencil size={16} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void remove(row)}
                    aria-label={`حذف ${row.name}`}
                    className="rounded p-2 text-[var(--admin-danger)] hover:bg-red-500/10"
                    data-test-id={`tag-delete-${row.id}`}
                  >
                    <Trash2 size={16} aria-hidden="true" />
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
