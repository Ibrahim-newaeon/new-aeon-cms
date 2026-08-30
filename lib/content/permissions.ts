// lib/content/permissions.ts
import type { TokenPayload } from '@/lib/auth/session';

export type Role = TokenPayload['role'];
export type ContentStatus = 'draft' | 'published' | 'archived';

/**
 * Who may do what to a piece of content.
 *
 * The roles existed and nothing consulted them beyond "is this person allowed
 * to call the endpoint at all". Three consequences, all reachable by an author
 * with a normal session:
 *
 *   - publish their own work, with no review
 *   - set `authorId` to somebody else, because it was an optional field on the
 *     request body and the server took the client's word for it
 *   - edit and unpublish ANYONE's content, including an editor's live pages
 *
 * An author writes drafts. An editor decides what goes live. That is the whole
 * point of having the two roles, and it is expressed here rather than in each
 * route so the rules cannot drift apart.
 */

/** Deciding what the public sees is an editorial act. */
export function canPublish(role: Role): boolean {
  return role === 'admin' || role === 'editor';
}

/** Editors and admins work on anything; an author only on their own drafts. */
export function canEdit(role: Role, ownerId: string | null, userId: string): boolean {
  if (role === 'admin' || role === 'editor') return true;
  return ownerId === userId;
}

export type StatusRefusal = { ok: false; reason: 'cannot-publish' | 'cannot-unpublish' };

/**
 * The status an author is actually allowed to save.
 *
 * Refuses rather than silently downgrading to draft: someone who pressed
 * Publish and got a page that says "saved" while staying invisible has been
 * told something untrue, and will press it again.
 *
 * Archiving is barred for the same reason as publishing — it changes what the
 * public sees.
 */
export function checkStatusChange(
  role: Role,
  next: ContentStatus,
  current: ContentStatus | null
): { ok: true } | StatusRefusal {
  if (canPublish(role)) return { ok: true };

  if (next === 'published') return { ok: false, reason: 'cannot-publish' };

  // Taking a live page down is equally an editorial decision, and an author who
  // owns a published post could otherwise pull it from the site unilaterally.
  // `next` cannot be 'published' here — the check above returned — so reaching
  // this line with a live page already means it is coming down.
  if (current === 'published') return { ok: false, reason: 'cannot-unpublish' };

  if (next === 'archived') return { ok: false, reason: 'cannot-unpublish' };

  return { ok: true };
}

/**
 * Whose name goes on it.
 *
 * `authorId` arrived as an optional field on the request body, so any author
 * could attribute a post to a colleague. Only an admin or editor may assign
 * one — reassignment is a real editorial need — and for everyone else it is
 * the session's own subject, never the client's suggestion.
 */
export function resolveAuthorId(
  role: Role,
  requested: string | undefined,
  userId: string
): string {
  return canPublish(role) && requested ? requested : userId;
}

/** What to tell the person, in the admin's Arabic-first voice. */
export const PERMISSION_MESSAGE: Record<StatusRefusal['reason'] | 'not-yours', string> = {
  'cannot-publish': 'النشر من صلاحية المحرّر. احفظ المسودة وسيراجعها المحرّر.',
  'cannot-unpublish': 'إلغاء النشر من صلاحية المحرّر.',
  'not-yours': 'يمكنك تعديل مسوداتك فقط.',
};
