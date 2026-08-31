// components/admin/seo-readiness.tsx
import { Check, AlertCircle, MinusCircle, ExternalLink } from 'lucide-react';
import { seoReadiness, type CheckState } from '@/lib/seo/readiness';
import { createTranslator } from '@/lib/admin-i18n';
import { getAdminLocale } from '@/lib/admin-i18n/server';
import type { MessageKey } from '@/lib/admin-i18n';

/**
 * What still needs writing.
 *
 * The tags, the schema, the sitemap and llms.txt are generated and cannot be
 * forgotten. The sentences can — and a blank settings field looks exactly like
 * one that was never required. This is the difference between "the feature
 * exists" and "the client used it".
 *
 * It reports state, not a score. "Brand answer: not written" is something to
 * act on; a percentage is something to argue with.
 */
const ICON: Record<CheckState, typeof Check> = {
  done: Check,
  partial: MinusCircle,
  missing: AlertCircle,
};

const TONE: Record<CheckState, string> = {
  done: 'text-[var(--admin-success)]',
  partial: 'text-[var(--admin-accent)]',
  missing: 'text-[var(--admin-text-muted)]',
};

export async function SeoReadiness() {
  const locale = await getAdminLocale();
  const t = createTranslator(locale);
  const checks = await seoReadiness(locale);

  const outstanding = checks.filter((c) => c.state !== 'done').length;

  return (
    <div className="flex flex-col gap-3" data-test-id="seo-readiness">
      <p className="text-sm text-[var(--admin-text-secondary)]">
        {outstanding === 0 ? t('seo.allDone') : t('seo.intro', { count: outstanding })}
      </p>

      <ul className="flex flex-col gap-2">
        {checks.map((check) => {
          const Icon = ICON[check.state];
          return (
            <li key={check.id} className="flex items-start gap-2 text-sm" data-test-id={`seo-${check.id}`}>
              <Icon size={16} className={`mt-0.5 shrink-0 ${TONE[check.state]}`} aria-hidden="true" />
              <span>
                <span className={check.state === 'done' ? 'text-[var(--admin-text-secondary)]' : ''}>
                  {t(`seo.${check.id}` as MessageKey)}
                </span>
                {/* The number is the useful part on a partial: "31 of 52" tells
                    you there is work left and how much. */}
                {check.total !== undefined && check.state !== 'done' && (
                  <span className="ms-2 text-xs tabular-nums text-[var(--admin-text-muted)]">
                    {check.count} / {check.total}
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ul>

      {/* The generated side, so nobody wonders whether it exists. */}
      <div className="flex flex-wrap gap-3 border-t border-[var(--admin-line)] pt-3 text-xs">
        {[
          { href: '/sitemap.xml', label: 'sitemap.xml' },
          { href: '/robots.txt', label: 'robots.txt' },
          { href: '/llms.txt', label: 'llms.txt' },
        ].map((link) => (
          <a
            key={link.href}
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[var(--admin-accent-soft)] hover:underline"
          >
            {link.label}
            <ExternalLink size={11} aria-hidden="true" />
          </a>
        ))}
      </div>
    </div>
  );
}
