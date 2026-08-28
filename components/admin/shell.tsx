// components/admin/shell.tsx
'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { Sidebar, type SidebarUser } from './sidebar';
import { Header } from './header';
import { cn } from '@/lib/utils';
import { useT } from './i18n-provider';

interface AdminShellProps {
  children: React.ReactNode;
  user: SidebarUser;
  siteName: string;
  adminPath: string;
  eCommerceEnabled?: boolean;
  logo?: string | null;
}

export function AdminShell({
  children,
  user,
  siteName,
  adminPath,
  eCommerceEnabled = false,
  logo,
}: AdminShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const t = useT();
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen bg-[var(--admin-bg)] text-[var(--admin-text)]">
      {sidebarOpen && (
        <button
          type="button"
          aria-label={t('common.closeMenu')}
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* 256px, matching the Juman sidebar. Logical inset/translate so the
          drawer slides from the reading-start edge in both directions. */}
      {/*
        The off-canvas transform is scoped with max-lg: rather than reset by
        lg:translate-x-0. `[dir="rtl"] .rtl\:translate-x-full` has specificity
        (0,2,0) while `.lg\:translate-x-0` has (0,1,0) — media queries add no
        specificity, so the RTL rule won at every breakpoint and the sidebar sat
        256px off-screen on desktop. Applying the transform only below lg means
        there is nothing to override.
      */}
      <aside
        className={cn(
          'fixed inset-y-0 start-0 z-50 flex w-64 shrink-0 flex-col border-e border-[var(--admin-line)]',
          'transition-transform duration-300 lg:static',
          !sidebarOpen && 'max-lg:rtl:translate-x-full max-lg:ltr:-translate-x-full'
        )}
      >
        <Sidebar
          user={user}
          currentPath={pathname}
          siteName={siteName}
          adminPath={adminPath}
          eCommerceEnabled={eCommerceEnabled}
          logo={logo}
        />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <Header onMenuClick={() => setSidebarOpen(true)} siteName={siteName} />
        <main className="admin-scroll flex-1 overflow-auto p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
