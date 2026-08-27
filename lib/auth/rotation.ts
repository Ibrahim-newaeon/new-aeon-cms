// lib/auth/rotation.ts
import { db } from '@/lib/db';
import { refreshTokens, users } from '@/lib/db/schema';
import { and, eq, isNull } from 'drizzle-orm';
import { createAccessToken, createRefreshToken, type TokenPayload } from './session';

export type RotationResult =
  | { ok: true; accessToken: string; refreshToken: string; user: TokenPayload }
  | { ok: false; reason: 'unknown' | 'expired' | 'reuse' | 'inactive' };

const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Rotates a refresh token: the presented one is revoked and a fresh pair issued.
 *
 * Reuse detection — the reason rotation exists at all. A refresh token is
 * single-use. If an ALREADY-REVOKED jti is presented, either the token was
 * stolen and replayed, or the legitimate holder is replaying an old one. Either
 * way both copies are now suspect, so every session for that user is revoked.
 * Losing a session beats leaving a thief with a valid one.
 */
export async function rotateRefreshToken(jti: string, userId: string): Promise<RotationResult> {
  const rows = await db
    .select()
    .from(refreshTokens)
    .where(eq(refreshTokens.jti, jti))
    .limit(1);

  const existing = rows[0];

  // Unknown jti: a forged or long-purged token. Nothing to revoke.
  if (!existing) return { ok: false, reason: 'unknown' };

  if (existing.revokedAt) {
    await revokeAllUserTokens(userId);
    return { ok: false, reason: 'reuse' };
  }

  if (existing.expiresAt.getTime() <= Date.now()) {
    return { ok: false, reason: 'expired' };
  }

  // The token belongs to someone else — treat as forgery, do not rotate.
  if (existing.userId !== userId) return { ok: false, reason: 'unknown' };

  const userRows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const user = userRows[0];
  if (!user || !user.isActive || !user.role) return { ok: false, reason: 'inactive' };

  const newJti = crypto.randomUUID();

  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date(), replacedBy: newJti })
    .where(eq(refreshTokens.jti, jti));

  await db.insert(refreshTokens).values({
    jti: newJti,
    userId,
    expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
  });

  const payload = {
    sub: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    jti: crypto.randomUUID(),
  };

  const [accessToken, refreshToken] = await Promise.all([
    createAccessToken(payload),
    createRefreshToken(userId, newJti),
  ]);

  return { ok: true, accessToken, refreshToken, user: { ...payload, iat: Date.now() / 1000 } };
}

export async function revokeAllUserTokens(userId: string): Promise<void> {
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));
}
