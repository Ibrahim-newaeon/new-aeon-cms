// components/admin/stat-card.tsx
import Link from 'next/link';
import {
  FileText, CheckCircle, Edit, Image as ImageIcon, Package, Tag,
  TrendingUp, ShoppingBag, type LucideIcon,
} from 'lucide-react';

const ICONS: Record<string, LucideIcon> = {
  'file-text': FileText,
  'check-circle': CheckCircle,
  edit: Edit,
  image: ImageIcon,
  package: Package,
  tag: Tag,
  trending: TrendingUp,
  bag: ShoppingBag,
};

interface StatCardProps {
  title: string;
  value: number | string;
  icon: keyof typeof ICONS | string;
  /** Makes the whole card a link, as in the Juman dashboard. */
  href?: string;
}

export function StatCard({ title, value, icon, href }: StatCardProps) {
  const Icon = ICONS[icon] ?? FileText;

  const body = (
    <>
      <div className="mb-4 flex items-center justify-between">
        <span className="text-xs text-[var(--admin-text-muted)]">{title}</span>
        <Icon size={18} aria-hidden="true" className="text-[var(--admin-text-muted)]" />
      </div>
      <p className="text-2xl font-semibold" dir="ltr">
        {value}
      </p>
    </>
  );

  const className =
    'admin-card block transition-colors hover:border-[var(--admin-accent)]/40';

  if (href) {
    return (
      <Link href={href} className={className} data-test-id={`stat-${icon}`}>
        {body}
      </Link>
    );
  }

  return (
    <div className={className} data-test-id={`stat-${icon}`}>
      {body}
    </div>
  );
}
