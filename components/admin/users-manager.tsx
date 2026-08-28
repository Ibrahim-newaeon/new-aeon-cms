// components/admin/users-manager.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, X, Loader2, KeyRound, Pencil, UserX, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { userRoles, type UserRole } from '@/lib/user-schema';
import { useT, useAdminI18n } from './i18n-provider';
import type { MessageKey } from '@/lib/admin-i18n';

// The role labels in lib/user-schema.ts are Arabic-only literals used by API
// error messages too, so the admin UI maps to catalogue keys instead of
// importing them.
const ROLE_KEY: Record<UserRole, MessageKey> = {
  admin: 'role.admin',
  editor: 'role.editor',
  author: 'role.author',
};
const ROLE_DESC_KEY: Record<UserRole, MessageKey> = {
  admin: 'role.adminDesc',
  editor: 'role.editorDesc',
  author: 'role.authorDesc',
};

export interface UserRow {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string | null;
}

export function UsersManager({ initial, currentUserId }: { initial: UserRow[]; currentUserId: string }) {
  const t = useT();
  const { locale } = useAdminI18n();
  const router = useRouter();
  const [rows, setRows] = useState(initial);
  const [mode, setMode] = useState<'idle' | 'create' | 'edit' | 'password'>('idle');
  const [targetId, setTargetId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [form, setForm] = useState({ email: '', name: '', role: 'editor' as UserRole, isActive: true });
  const [password, setPassword] = useState('');

  const activeAdmins = rows.filter((r) => r.role === 'admin' && r.isActive).length;

  const reset = () => {
    setMode('idle');
    setTargetId(null);
    setPassword('');
    setError(null);
  };

  const call = async (url: string, method: string, body: unknown) => {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.success) {
      throw new Error(data?.error?.issues?.[0]?.message ?? data?.error?.message ?? t('common.actionFailed'));
    }
    return data;
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (mode === 'create') {
        await call('/api/users', 'POST', { ...form, password });
        setNotice(t('users.created'));
      } else if (mode === 'edit' && targetId) {
        await call(`/api/users/${targetId}`, 'PATCH', {
          name: form.name,
          role: form.role,
          isActive: form.isActive,
        });
        setNotice(t('users.savedChanges'));
      } else if (mode === 'password' && targetId) {
        await call(`/api/users/${targetId}`, 'PUT', { password });
        setNotice(t('users.passwordChanged'));
      }
      reset();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.actionFailed'));
    } finally {
      setBusy(false);
    }
  };

  const deactivate = async (row: UserRow) => {
    if (!window.confirm(t('users.deactivateConfirm', { name: row.name }))) return;
    setError(null);
    try {
      await call(`/api/users/${row.id}`, 'DELETE', {});
      setRows((p) => p.map((r) => (r.id === row.id ? { ...r, isActive: false } : r)));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('users.deactivateFailed'));
    }
  };

  return (
    <div className="space-y-5" data-test-id="users-manager">
      {activeAdmins === 1 && (
        <p className="admin-card border-[var(--admin-warning)] text-sm text-[var(--admin-warning)]">
          {t('users.lastAdminWarning')}
        </p>
      )}

      {mode === 'idle' && (
        <button
          type="button"
          onClick={() => {
            setForm({ email: '', name: '', role: 'editor', isActive: true });
            setPassword('');
            setMode('create');
          }}
          className="admin-btn"
          data-test-id="user-new"
        >
          <Plus size={16} aria-hidden="true" />
          {t('users.new')}
        </button>
      )}

      {notice && (
        <p role="status" className="admin-card border-[var(--admin-success)] text-sm text-[var(--admin-success)]">
          {notice}
        </p>
      )}

      {mode !== 'idle' && (
        <div className="admin-card space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-medium">
              {mode === 'create' ? t('users.new') : mode === 'edit' ? t('users.edit') : t('users.changePassword')}
            </h2>
            <button type="button" onClick={reset} aria-label={t('common.close')} className="rounded p-1.5 hover:bg-white/5">
              <X size={16} aria-hidden="true" />
            </button>
          </div>

          {mode !== 'password' && (
            <div className="grid gap-4 sm:grid-cols-2">
              {mode === 'create' && (
                <Field label={t('auth.email')}>
                  <input
                    type="email"
                    dir="ltr"
                    className="admin-input text-start"
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    data-test-id="user-email"
                  />
                </Field>
              )}

              <Field label={t('common.name')}>
                <input
                  type="text"
                  className="admin-input"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  data-test-id="user-name"
                />
              </Field>

              <Field label={t('users.role')} hint={t(ROLE_DESC_KEY[form.role])}>
                <select
                  className="admin-input"
                  value={form.role}
                  onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as UserRole }))}
                  data-test-id="user-role"
                >
                  {userRoles.map((r) => (
                    <option key={r} value={r}>
                      {t(ROLE_KEY[r])}
                    </option>
                  ))}
                </select>
              </Field>

              <label className="flex items-end gap-2 pb-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
                  data-test-id="user-active"
                />
                {t('users.accountActive')}
              </label>
            </div>
          )}

          {(mode === 'create' || mode === 'password') && (
            <Field label={t('users.password')} hint={t('users.passwordHint')}>
              <input
                type="password"
                dir="ltr"
                autoComplete="new-password"
                className="admin-input text-start"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                data-test-id="user-password"
              />
              {password.length > 0 && password.length < 12 && (
                <span className="mt-1 block text-xs text-[var(--admin-danger)]">
                  {t('users.passwordShort', { count: 12 - password.length })}
                </span>
              )}
            </Field>
          )}

          {error && (
            <p role="alert" className="text-sm text-[var(--admin-danger)]">
              {error}
            </p>
          )}

          <button type="button" onClick={() => void submit()} disabled={busy} className="admin-btn" data-test-id="user-save">
            {busy && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
            {t('common.save')}
          </button>
        </div>
      )}

      <ul className="admin-card divide-y divide-[var(--admin-line)] p-0">
        {rows.map((row) => {
          const isSelf = row.id === currentUserId;
          const isLastAdmin = row.role === 'admin' && row.isActive && activeAdmins === 1;

          return (
            <li key={row.id} className="flex flex-wrap items-center gap-3 p-4" data-test-id={`user-${row.id}`}>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-sm font-medium">
                  {row.name}
                  {row.role === 'admin' && (
                    <ShieldCheck size={14} aria-hidden="true" className="text-[var(--admin-accent)]" />
                  )}
                  {isSelf && (
                    <span className="rounded-full bg-[var(--admin-accent-muted)] px-2 py-0.5 text-[10px] text-[var(--admin-accent-soft)]">
                      {t('users.you')}
                    </span>
                  )}
                </p>
                <p className="truncate text-xs text-[var(--admin-text-muted)]" dir="ltr">
                  {row.email}
                </p>
              </div>

              <span className="text-sm text-[var(--admin-text-secondary)]">{t(ROLE_KEY[row.role])}</span>

              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-[11px]',
                  row.isActive
                    ? 'bg-green-500/15 text-green-400'
                    : 'bg-white/5 text-[var(--admin-text-muted)]'
                )}
              >
                {row.isActive ? t('common.enabled') : t('common.disabled')}
              </span>

              <span className="w-28 text-xs text-[var(--admin-text-muted)]" dir="ltr">
                {row.lastLoginAt ? new Date(row.lastLoginAt).toLocaleDateString(locale === 'ar' ? 'ar-JO' : 'en-GB') : '—'}
              </span>

              <button
                type="button"
                onClick={() => {
                  setForm({ email: row.email, name: row.name, role: row.role, isActive: row.isActive });
                  setTargetId(row.id);
                  setMode('edit');
                  setNotice(null);
                }}
                aria-label={t('common.editItem', { name: row.name })}
                className="rounded p-2 text-[var(--admin-text-secondary)] hover:bg-white/5"
                data-test-id={`user-edit-${row.id}`}
              >
                <Pencil size={16} aria-hidden="true" />
              </button>

              <button
                type="button"
                onClick={() => {
                  setTargetId(row.id);
                  setPassword('');
                  setMode('password');
                  setNotice(null);
                }}
                aria-label={t('users.changePasswordFor', { name: row.name })}
                className="rounded p-2 text-[var(--admin-text-secondary)] hover:bg-white/5"
                data-test-id={`user-password-${row.id}`}
              >
                <KeyRound size={16} aria-hidden="true" />
              </button>

              <button
                type="button"
                onClick={() => void deactivate(row)}
                disabled={isSelf || isLastAdmin || !row.isActive}
                aria-label={t('users.deactivate', { name: row.name })}
                title={isSelf ? t('users.cannotDeactivateSelf') : isLastAdmin ? t('users.lastActiveAdmin') : t('users.deactivateAction')}
                className="rounded p-2 text-[var(--admin-danger)] hover:bg-red-500/10 disabled:opacity-30"
                data-test-id={`user-deactivate-${row.id}`}
              >
                <UserX size={16} aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
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
