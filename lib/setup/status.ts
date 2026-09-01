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
