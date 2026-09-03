// app/(root)/page.tsx
import { redirect } from 'next/navigation';
import { getDefaultLocale } from '@/lib/default-locale';
import { needsSetup } from '@/lib/setup/status';

export const dynamic = 'force-dynamic';

/**
 * `/` — sends the visitor to the store's primary language.
 *
 * ── Why this is a page and not a line in middleware ─────────────────────────
 * Middleware did this, prefixing DEFAULT_LOCALE from the environment. That is
 * the one place the operator's answer mattered most and could least be
 * honoured: middleware runs on the Edge runtime and must stay free of Node
 * imports, so it cannot read `settings` — it cannot know which language this
 * shop chose. So an operator who picked English at setup typed their domain
 * and landed on the Arabic site, permanently, with the wizard's own language
 * question apparently ignored.
 *
 * A server component can read the database, so the decision moved here and
 * middleware now passes `/` through untouched. Deeper unprefixed paths
 * (`/shop`, a stale link) are still prefixed with the env default in
 * middleware: those are typos and legacy URLs where a guess is fine, and
 * routing every one of them through a database read would put a query in front
 * of every 404.
 *
 * The setup check is here rather than one redirect later so a fresh deploy
 * answers its very first request with the wizard instead of bouncing through
 * a locale it has not been given yet.
 */
export default async function RootPage() {
  if (await needsSetup()) redirect('/setup');
  redirect(`/${await getDefaultLocale()}`);
}
