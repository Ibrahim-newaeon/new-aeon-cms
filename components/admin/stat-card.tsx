// components/admin/stat-card.tsx
import Link from 'next/link';
import {
  FileText, CheckCircle, Edit, Image as ImageIcon, Package, Tag,
  TrendingUp, TrendingDown, Minus, ShoppingBag, type LucideIcon,
} from 'lucide-react';
import type { Trend } from '@/lib/admin/trend';

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
  /** Period-over-period change. Omitted where a trend is meaningless. */
  trend?: Trend;
  /** Rendered beside the trend, e.g. "vs last 30 days". */
  trendLabel?: string;
  /** Shown instead of a percentage when the previous window was empty. */
  newLabel?: string;
}

export function StatCard({ title, value, icon, href, trend, trendLabel, newLabel }: StatCardProps) {
  const Icon = ICONS[icon] ?? FileText;

  /**
   * A flat trend is grey, not green.
   *
   * Colouring "no change" as positive is the small dishonesty that makes a
   * dashboard stop being read.
   */
  const TrendIcon =
    trend?.kind === 'change'
      ? trend.direction === 'up'
        ? TrendingUp
        : trend.direction === 'down'
          ? TrendingDown
          : Minus
      : null;

  const trendColour =
    trend?.kind === 'change' && trend.direction === 'up'
      ? 'text-[var(--admin-success)]'
      : trend?.kind === 'change' && trend.direction === 'down'
        ? 'text-[var(--admin-danger)]'
        : 'text-[var(--admin-text-muted)]';

  const body = (
    <>
      <div className="mb-4 flex items-center justify-between">
        <span className="text-xs text-[var(--admin-text-muted)]">{title}</span>
        <Icon size={18} aria-hidden="true" className="text-[var(--admin-text-muted)]" />
      </div>
      <p className="text-2xl font-semibold" dir="ltr">
        {value}
      </p>

      {/* Nothing is rendered when both windows are empty — an empty row is
          better than a confident zero. */}
      {trend && trend.kind !== 'none' && (
        <p className={`mt-2 flex items-center gap-1.5 text-xs ${trendColour}`} data-test-id="stat-trend">
          {TrendIcon && <TrendIcon size={13} aria-hidden="true" />}
          <span dir="ltr">
            {trend.kind === 'new'
              ? `+${trend.current}`
              : `${trend.direction === 'down' ? '−' : trend.direction === 'up' ? '+' : ''}${trend.percent}%`}
          </span>
          <span className="text-[var(--admin-text-muted)]">
            {trend.kind === 'new' ? newLabel : trendLabel}
          </span>
        </p>
      )}
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
