// components/admin/sidebar.tsx
'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  LayoutGrid, Package, BookOpen, Tag, Layers, ShoppingBag, Images, ImageIcon,
  Ticket, Truck, Settings, ShieldCheck, FileText, Link2, LogOut, ExternalLink, Star, Boxes,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { BrandMark } from './brand-mark';
import { useT } from './i18n-provider';
import type { MessageKey } from '@/lib/admin-i18n';

export interface SidebarUser {
  name: string;
  email: string;
  role: 'admin' | 'editor' | 'author';
}

interface NavItem {
  key: MessageKey;
  href: string;
  icon: typeof LayoutGrid;
  commerceOnly?: boolean;
}

const ROLE_KEY: Record<SidebarUser['role'], MessageKey> = {
  admin: 'role.admin',
  editor: 'role.editor',
  author: 'role.author',
};

/**
 * Flat nav, matching the Juman admin: every item is one row with a trailing
 * icon, no collapsible groups. Hrefs are built from adminPath so ADMIN_PATH
 * stays configurable.
 */
function buildNavigation(adminPath: string): NavItem[] {
  return [
    { key: 'nav.overview', href: adminPath, icon: LayoutGrid },
    { key: 'nav.pages', href: `${adminPath}/content/pages`, icon: FileText },
    { key: 'nav.posts', href: `${adminPath}/content/posts`, icon: Package },
    { key: 'nav.resources', href: `${adminPath}/content/resources`, icon: BookOpen },
    { key: 'nav.categories', href: `${adminPath}/content/categories`, icon: Tag },
    { key: 'nav.tags', href: `${adminPath}/content/tags`, icon: Layers },
    { key: 'nav.media', href: `${adminPath}/media`, icon: ImageIcon },
    { key: 'nav.navigation', href: `${adminPath}/navigation`, icon: Images },
    { key: 'nav.products', href: `${adminPath}/commerce/products`, icon: ShoppingBag, commerceOnly: true },
    { key: 'nav.brands', href: `${adminPath}/commerce/brands`, icon: Tag, commerceOnly: true },
    { key: 'nav.orders', href: `${adminPath}/commerce/orders`, icon: Package, commerceOnly: true },
    { key: 'nav.reviews', href: `${adminPath}/commerce/reviews`, icon: Star, commerceOnly: true },
    { key: 'nav.bundles', href: `${adminPath}/commerce/bundles`, icon: Boxes, commerceOnly: true },
    { key: 'nav.coupons', href: `${adminPath}/commerce/coupons`, icon: Ticket, commerceOnly: true },
    { key: 'nav.shipping', href: `${adminPath}/commerce/shipping`, icon: Truck, commerceOnly: true },
    { key: 'nav.forms', href: `${adminPath}/forms`, icon: Link2 },
    { key: 'nav.settings', href: `${adminPath}/settings`, icon: Settings },
    { key: 'nav.users', href: `${adminPath}/users`, icon: ShieldCheck },
  ];
}

export function Sidebar({
  user,
  currentPath,
  siteName,
  adminPath,
  eCommerceEnabled,
  logo,
}: {
  user: SidebarUser;
  currentPath: string;
  siteName: string;
  adminPath: string;
  eCommerceEnabled: boolean;
  logo?: string | null;
}) {
  const t = useT();

  const navigation = buildNavigation(adminPath).filter(
    (item) => !item.commerceOnly || eCommerceEnabled
  );

  // Exact match for the dashboard root, prefix match elsewhere — otherwise
  // every route would light up the overview row.
  const isActive = (href: string) =>
    href === adminPath ? currentPath === adminPath : currentPath.startsWith(href);

  return (
    <div className="flex h-full flex-col bg-[var(--admin-sidebar)]">
      <div className="border-b border-[var(--admin-line)] p-5">
        <BrandMark logo={logo} siteName={siteName} />
        <p className="mt-2 text-xs text-[var(--admin-text-muted)]">{t('brand.subtitle')}</p>
        {/* dir=ltr: a Latin username inside an RTL block otherwise reorders. */}
        <p className="mt-2 truncate text-[11px] text-[var(--admin-text-secondary)]" dir="ltr">
          {user.email.split('@')[0]} · {t(ROLE_KEY[user.role])}
        </p>
      </div>

      <nav
        className="flex flex-1 flex-col gap-1 overflow-auto p-3 admin-scroll"
        aria-label={t('brand.mainMenu')}
      >
        {navigation.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              data-test-id={`sidebar-link-${item.href}`}
              className={cn('admin-nav-link justify-between', active && 'is-active')}
            >
              <span>{t(item.key)}</span>
              <item.icon size={18} aria-hidden="true" />
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto space-y-1 border-t border-[var(--admin-line)] p-3">
        <Link
          href="/"
          target="_blank"
          rel="noopener noreferrer"
          className="admin-btn-ghost w-full justify-start"
          data-test-id="sidebar-view-site"
        >
          <ExternalLink size={16} aria-hidden="true" />
          {t('brand.viewSite')}
        </Link>
        <LogoutButton />
      </div>
    </div>
  );
}

/**
 * Was a bare <form method="POST"> — submittable cross-origin, i.e. logout CSRF.
 * A same-origin fetch cannot be forged by a third-party page.
 */
function LogoutButton() {
  const t = useT();
  const [pending, setPending] = useState(false);

  const logout = async () => {
    setPending(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
      window.location.assign('/');
    } finally {
      setPending(false);
    }
  };

  return (
    <button
      type="button"
      onClick={logout}
      disabled={pending}
      data-test-id="sidebar-logout"
      className="admin-btn-ghost w-full justify-start text-red-300 hover:text-red-200 disabled:opacity-50"
    >
      <LogOut size={16} aria-hidden="true" />
      {t('brand.logout')}
    </button>
  );
}
