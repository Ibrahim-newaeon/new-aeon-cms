'use client';

import { useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Folder, FolderOpen, Plus, Pencil, Trash2, Loader2, Images } from 'lucide-react';
import { useT } from './i18n-provider';

export interface FolderNode {
  id: string;
  name: string;
  parentId: string | null;
  path: string;
  assetCount: number;
}

interface Props {
  folders: FolderNode[];
  rootCount: number;
  selectedId: string | null;
}

/**
 * The folder rail beside the media grid.
 *
 * One level of nesting, matching categories. Arbitrary depth means recursive
 * queries, wrapping breadcrumbs and a move UI nobody enjoys, for a library that
 * is a flat grid of a few hundred items.
 */
export function MediaFolders({ folders, rootCount, selectedId }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const t = useT();
  const [busy, setBusy] = useState(false);

  const roots = folders.filter((f) => !f.parentId);
  const childrenOf = (id: string) => folders.filter((f) => f.parentId === id);

  function select(id: string | null) {
    const next = new URLSearchParams(params.toString());
    if (id) next.set('folder', id);
    else next.delete('folder');
    // Selecting a folder and filtering to unused are different questions.
    next.delete('filter');
    router.push(`${pathname}?${next.toString()}`);
  }

  async function call(url: string, init: RequestInit) {
    setBusy(true);
    try {
      const res = await fetch(url, { credentials: 'same-origin', ...init });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        window.alert(data?.error?.message ?? t('common.saveFailed'));
        return false;
      }
      router.refresh();
      return true;
    } finally {
      setBusy(false);
    }
  }

  async function create(parentId: string | null) {
    const name = window.prompt(t('folders.namePrompt'));
    if (!name?.trim()) return;

    await call('/api/media/folders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), parentId }),
    });
  }

  async function rename(folder: FolderNode) {
    const name = window.prompt(t('folders.namePrompt'), folder.name);
    if (!name?.trim() || name.trim() === folder.name) return;

    await call(`/api/media/folders/${folder.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim() }),
    });
  }

  async function remove(folder: FolderNode) {
    // Stated plainly, because "delete folder" normally means losing what is in
    // it and here it does not.
    if (!window.confirm(t('folders.deleteConfirm', { count: folder.assetCount }))) return;

    if (await call(`/api/media/folders/${folder.id}`, { method: 'DELETE' })) {
      if (selectedId === folder.id) select(null);
    }
  }

  const row = (folder: FolderNode, nested: boolean) => {
    const active = selectedId === folder.id;

    return (
      <li key={folder.id}>
        <div
          className={`group flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm ${
            nested ? 'ms-4' : ''
          } ${active ? 'bg-[var(--admin-elevated)] text-[var(--admin-text)]' : 'text-[var(--admin-text-secondary)]'}`}
        >
          <button
            type="button"
            onClick={() => select(folder.id)}
            className="flex min-w-0 flex-1 items-center gap-2 text-start"
            data-test-id={`folder-${folder.id}`}
          >
            {active ? (
              <FolderOpen size={15} aria-hidden="true" className="shrink-0" />
            ) : (
              <Folder size={15} aria-hidden="true" className="shrink-0" />
            )}
            <span className="truncate">{folder.name}</span>
            <span className="shrink-0 text-xs text-[var(--admin-text-muted)]" dir="ltr">
              {folder.assetCount}
            </span>
          </button>

          <span className="flex shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
            {!nested && (
              <button
                type="button"
                onClick={() => void create(folder.id)}
                aria-label={t('folders.addChild')}
                title={t('folders.addChild')}
                className="rounded p-1 hover:bg-white/5"
              >
                <Plus size={13} aria-hidden="true" />
              </button>
            )}
            <button
              type="button"
              onClick={() => void rename(folder)}
              aria-label={t('common.editItem', { name: folder.name })}
              className="rounded p-1 hover:bg-white/5"
            >
              <Pencil size={13} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => void remove(folder)}
              aria-label={t('common.deleteItem', { name: folder.name })}
              className="rounded p-1 text-[var(--admin-danger)] hover:bg-red-500/10"
            >
              <Trash2 size={13} aria-hidden="true" />
            </button>
          </span>
        </div>

        {!nested && childrenOf(folder.id).length > 0 && (
          <ul>{childrenOf(folder.id).map((child) => row(child, true))}</ul>
        )}
      </li>
    );
  };

  return (
    <aside className="admin-card h-fit space-y-2 p-3" data-test-id="media-folders">
      <div className="flex items-center justify-between gap-2 px-2">
        <span className="text-xs font-medium text-[var(--admin-text-muted)]">
          {t('folders.title')}
        </span>
        <button
          type="button"
          disabled={busy}
          onClick={() => void create(null)}
          aria-label={t('folders.add')}
          title={t('folders.add')}
          data-test-id="folder-new"
          className="rounded p-1 text-[var(--admin-text-secondary)] hover:bg-white/5"
        >
          {busy ? (
            <Loader2 size={14} className="animate-spin" aria-hidden="true" />
          ) : (
            <Plus size={14} aria-hidden="true" />
          )}
        </button>
      </div>

      <ul className="space-y-0.5">
        <li>
          <button
            type="button"
            onClick={() => select(null)}
            data-test-id="folder-root"
            className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-start text-sm ${
              selectedId === null
                ? 'bg-[var(--admin-elevated)] text-[var(--admin-text)]'
                : 'text-[var(--admin-text-secondary)]'
            }`}
          >
            <Images size={15} aria-hidden="true" className="shrink-0" />
            <span className="flex-1">{t('folders.all')}</span>
            <span className="text-xs text-[var(--admin-text-muted)]" dir="ltr">
              {rootCount}
            </span>
          </button>
        </li>

        {roots.map((folder) => row(folder, false))}
      </ul>
    </aside>
  );
}
