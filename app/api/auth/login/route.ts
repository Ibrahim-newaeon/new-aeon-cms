// app/api/auth/login/route.ts
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { users, refreshTokens, auditLog } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { verifyPassword, hashPassword } from '@/lib/auth/password';
import { createAccessToken, createRefreshToken, setAuthCookies } from '@/lib/auth/session';
import { rateLimit, clientKey } from '@/lib/rate-limit';

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Invalid email').max(255),
  password: z.string().min(1, 'Password required').max(512),
});

/**
 * Precomputed Argon2 digest of a value nobody can supply. Verifying against it
 * when the account does not exist keeps the response time comparable to the
 * found-user path, closing the user-enumeration timing side channel.
 */
let dummyHashPromise: Promise<string> | null = null;
function getDummyHash() {
  dummyHashPromise ??= hashPassword('invalid-user-placeholder-password');
  return dummyHashPromise;
}

const INVALID_CREDENTIALS = { message: 'Invalid credentials' };

export async function POST(request: Request) {
  // 5 attempts per 15 minutes per IP.
  const limit = await rateLimit(clientKey(request, 'login'), 5, 900);
  if (!limit.allowed) {
    return NextResponse.json(
      { success: false, error: { message: 'Too many attempts. Try again later.' } },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
    );
  }

  try {
    const parsed = loginSchema.safeParse(await request.json());
    if (!parsed.success) {
      // Deliberately generic: field-level detail would confirm which half was
      // wrong and help enumerate accounts.
      return NextResponse.json({ success: false, error: INVALID_CREDENTIALS }, { status: 400 });
    }

    const { email, password } = parsed.data;

    const rows = await db.select().from(users).where(eq(users.email, email)).limit(1);
    const foundUser = rows[0];

    if (!foundUser) {
      await verifyPassword(await getDummyHash(), password);
      return NextResponse.json({ success: false, error: INVALID_CREDENTIALS }, { status: 401 });
    }

    const valid = await verifyPassword(foundUser.passwordHash, password);

    // Check the password BEFORE reporting "disabled" — otherwise the distinct
    // 403 tells an attacker the address is a real account.
    if (!valid) {
      return NextResponse.json({ success: false, error: INVALID_CREDENTIALS }, { status: 401 });
    }

    if (!foundUser.isActive) {
      return NextResponse.json(
        { success: false, error: { message: 'Account disabled' } },
        { status: 403 }
      );
    }

    if (!foundUser.role) {
      console.error('User has no role assigned:', foundUser.id);
      return NextResponse.json(
        { success: false, error: { message: 'Internal server error' } },
        { status: 500 }
      );
    }

    const refreshJti = crypto.randomUUID();
    await db.insert(refreshTokens).values({
      jti: refreshJti,
      userId: foundUser.id,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    const accessToken = await createAccessToken({
      sub: foundUser.id,
      email: foundUser.email,
      name: foundUser.name,
      role: foundUser.role,
      jti: crypto.randomUUID(),
    });
    const refreshToken = await createRefreshToken(foundUser.id, refreshJti);

    await setAuthCookies(accessToken, refreshToken);

    await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, foundUser.id));

    // The auditLog table existed but was never written to.
    await db.insert(auditLog).values({
      userId: foundUser.id,
      action: 'login',
      entityType: 'user',
      entityId: foundUser.id,
      ipAddress: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
      userAgent: request.headers.get('user-agent') ?? null,
    });

    return NextResponse.json({
      success: true,
      data: {
        user: {
          id: foundUser.id,
          name: foundUser.name,
          email: foundUser.email,
          role: foundUser.role,
        },
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { success: false, error: { message: 'Internal server error' } },
      { status: 500 }
    );
  }
}
