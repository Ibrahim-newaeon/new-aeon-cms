// lib/setup/status.ts
import 'server-only';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

/**
 * Is this a brand-new install that nobody has configured yet?
 *
 * Defined as "no administrator exists", not "no settings row" or "no content".
 * A shop can legitimately empty its catalogue or reset its settings; it cannot
 * legitimately have nobody who can log in. That makes this the one condition
 * where handing an anonymous visitor the power to create an admin is safe —
 * there is no account for them to take over.
 *
 * ── Why the memo is one-way ─────────────────────────────────────────────────
 * This is checked on every request that renders a shell, so an unmemoised
 * query would add a round trip to every page load forever. The memo is safe
 * precisely because the transition only runs one way: an install that HAS an
 * admin can never go back to having none through any path the app exposes — user
 * deletion refuses to remove the last admin. So once we have seen an admin, we
 * never need to ask again.
 *
 * The false case is deliberately NOT cached: before setup completes we must
 * keep asking, or the process that renders the wizard would still believe
 * setup is pending after another process completed it.
 *
 * ── Why `is_active` is not consulted ────────────────────────────────────────
 * The CMS never hard-deletes a user — DELETE /api/users/[id] sets
 * is_active = false, because content.author_id and four other columns
 * reference users with no ON DELETE rule and deactivating keeps authorship
 * intact. So "removed" means inactive there, and "exists" means present here.
 * The two disagree on purpose, and only in the safe direction.
 *
 * Counting only ACTIVE admins would mean a site whose admins had all been
 * deactivated reopens the unauthenticated account-creation form to whoever
 * asks for it. This function guards the one path that mints an owner without
 * credentials, so it has to fail closed: any admin row at all, active or not,
 * means somebody owns this install.
 *
 * That state is not reachable through the UI anyway — wouldRemoveLastAdmin()
 * refuses to demote, deactivate or delete the last active admin. It is
 * reachable by direct SQL, which is also how it gets fixed; see
 * `npm run setup:reset`, which changes the ROLE rather than the flag,
 * precisely because the flag is not what this reads.
 */
let installed = false;

export async function needsSetup(): Promise<boolean> {
  if (installed) return false;

  const [admin] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.role, 'admin'))
    .limit(1);

  if (admin) {
    installed = true;
    return false;
  }
  return true;
}

/** Called after a successful install so the current process stops querying. */
export function markInstalled(): void {
  installed = true;
}

/** Tests only: lets a spec put the process back into the pre-setup state. */
export function resetInstalledMemo(): void {
  installed = false;
}
