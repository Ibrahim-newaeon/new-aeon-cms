// lib/auth/password-reset.ts
import 'server-only';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { db } from '@/lib/db';
import { users, passwordResetTokens, refreshTokens, auditLog } from '@/lib/db/schema';
import { and, eq, isNull, gt } from 'drizzle-orm';
import { hashPassword } from './password';

/**
 * Self-service password reset.
 *
 * Two rules shape everything here:
 *
 * 1. The database stores a hash of the token, never the token. A leaked dump
 *    must not be a set of working reset links.
 * 2. Nothing in this module tells an anonymous caller whether an address
 *    exists. The login endpoint deliberately avoids being a user-enumeration
 *    oracle; a reset form that says "no such user" hands back exactly what
 *    login refuses to.
 */

export const RESET_TOKEN_TTL_MINUTES = 60;
const MIN_PASSWORD_LENGTH = 12;

/**
 * SHA-256, not Argon2.
 *
 * Argon2 is right for passwords because they are low-entropy and guessable.
 * This token is 32 random bytes; brute-forcing it is not a threat model, and a
 * deliberately slow hash on a lookup path is just a denial-of-service surface.
 */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export interface IssuedReset {
  token: string;
  expiresAt: Date;
}

/**
 * Issues a reset token, or returns null when there is nobody to issue it to.
 *
 * The caller must answer identically either way. An inactive user is treated
 * exactly like a missing one — a disabled account should not be re-openable by
 * its former owner.
 */
export async function issueResetToken(
  email: string,
  requestedIp: string | null
): Promise<{ user: typeof users.$inferSelect; reset: IssuedReset } | null> {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email.trim().toLowerCase()))
    .limit(1);

  if (!user || !user.isActive) return null;

  // Any earlier outstanding token is spent. Requesting a new link must
  // invalidate the old one, or a forwarded email stays usable indefinitely.
  await db
    .update(passwordResetTokens)
    .set({ usedAt: new Date() })
    .where(and(eq(passwordResetTokens.userId, user.id), isNull(passwordResetTokens.usedAt)));

  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60_000);

  await db.insert(passwordResetTokens).values({
    userId: user.id,
    tokenHash: hashToken(token),
    expiresAt,
    requestedIp,
  });

  return { user, reset: { token, expiresAt } };
}

export type ResetFailure = 'INVALID_TOKEN' | 'WEAK_PASSWORD';

export type ResetResult = { ok: true; userId: string } | { ok: false; reason: ResetFailure };

/**
 * Redeems a token and sets the new password.
 *
 * Consuming a token revokes every refresh token the user holds. If the reset
 * was triggered by a compromise, leaving the attacker's existing session alive
 * defeats the entire exercise.
 */
export async function redeemResetToken(token: string, newPassword: string): Promise<ResetResult> {
  if (newPassword.trim().length < MIN_PASSWORD_LENGTH) {
    return { ok: false, reason: 'WEAK_PASSWORD' };
  }

  const candidate = hashToken(token);

  const [row] = await db
    .select()
    .from(passwordResetTokens)
    .where(
      and(
        eq(passwordResetTokens.tokenHash, candidate),
        isNull(passwordResetTokens.usedAt),
        gt(passwordResetTokens.expiresAt, new Date())
      )
    )
    .limit(1);

  if (!row) return { ok: false, reason: 'INVALID_TOKEN' };

  // The lookup above already matched on equality, so this adds nothing against
  // a timing attack on the *lookup*. It guards the narrower case of a hash
  // collision being treated as a match.
  const a = Buffer.from(row.tokenHash);
  const b = Buffer.from(candidate);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: 'INVALID_TOKEN' };
  }

  const passwordHash = await hashPassword(newPassword);

  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(users.id, row.userId));

    // Single-use, enforced by marking rather than deleting so the audit trail
    // survives.
    await tx
      .update(passwordResetTokens)
      .set({ usedAt: new Date() })
      .where(eq(passwordResetTokens.id, row.id));

    await tx
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.userId, row.userId), isNull(refreshTokens.revokedAt)));

    await tx.insert(auditLog).values({
      userId: row.userId,
      action: 'user.password_reset',
      entityType: 'user',
      entityId: row.userId,
    });
  });

  return { ok: true, userId: row.userId };
}

/** Exported for the reset screen, so it can state the rule before submitting. */
export const PASSWORD_MIN_LENGTH = MIN_PASSWORD_LENGTH;
