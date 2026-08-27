// components/admin/header.tsx
'use client';

import Link from 'next/link';
import { Menu, ExternalLink } from 'lucide-react';
import { useT } from './i18n-provider';
import { LocaleSwitcher } from './locale-switcher';

interface HeaderProps {
  onMenuClick: () => void;
  siteName: string;
}

export function Header({ onMenuClick, siteName }: HeaderProps) {
  const t = useT();

  return (
    <header className="sticky top-0 z-40 flex items-center justify-between gap-3 border-b border-[var(--admin-line)] bg-[var(--admin-sidebar)]/90 px-4 py-3 backdrop-blur lg:px-6">
      <button
        type="button"
        onClick={onMenuClick}
        aria-label={t('brand.mainMenu')}
        data-test-id="admin-menu-toggle"
        className="rounded-lg p-2 hover:bg-white/5 lg:hidden"
      >
        <Menu size={20} aria-hidden="true" />
      </button>

      <div className="text-sm text-[var(--admin-text-secondary)]">
        {t('brand.headerTitle', { site: siteName })}
      </div>

      <div className="flex items-center gap-2">
        <LocaleSwitcher />
        <Link
        href="/"
        target="_blank"
        rel="noopener noreferrer"
        className="admin-btn-ghost px-3 py-1.5 text-xs"
        data-test-id="admin-view-site"
      >
        <ExternalLink size={14} aria-hidden="true" />
        {t('brand.site')}
        </Link>
      </div>
    </header>
  );
}
