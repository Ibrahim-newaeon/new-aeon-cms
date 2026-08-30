// tests/customer-session.test.ts
import { describe, it, expect } from 'vitest';
import { createCustomerToken, verifyCustomerToken } from '@/lib/auth/customer-session';
import { createAccessToken, verifyAccessToken } from '@/lib/auth/session';

const CUSTOMER_ID = '11111111-1111-4111-8111-111111111111';
const PHONE = '+962791234567';

const adminPayload = {
  sub: '22222222-2222-4222-8222-222222222222',
  email: 'admin@example.test',
  name: 'Admin',
  role: 'admin' as const,
  jti: 'abc',
};

describe('customer sessions', () => {
  it('round-trips a shopper token', async () => {
    const token = await createCustomerToken(CUSTOMER_ID, PHONE);
    expect(await verifyCustomerToken(token)).toEqual({ sub: CUSTOMER_ID, phone: PHONE });
  });

  it('an ADMIN token is not accepted as a shopper token', async () => {
    const admin = await createAccessToken(adminPayload);
    expect(await verifyCustomerToken(admin)).toBeNull();
  });

  it('a SHOPPER token is not accepted as an admin token', async () => {
    /**
     * The one that matters. Both are signed with the same secret, so without
     * the audience claim a customer's token is cryptographically
     * indistinguishable from staff. Every admin route happens to pass an
     * allowedRoles list today — but that is a property of 56 call sites, and
     * the next route added without one would be a hole.
     */
    const shopper = await createCustomerToken(CUSTOMER_ID, PHONE);
    await expect(verifyAccessToken(shopper)).rejects.toThrow();
  });

  it('rejects a token signed with a different key', async () => {
    const forged =
      'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4IiwicGhvbmUiOiIrOTYyNzkxMjM0NTY3In0.' +
      'not-a-real-signature';
    expect(await verifyCustomerToken(forged)).toBeNull();
  });

  it('rejects junk without throwing, since this runs on every page', async () => {
    for (const bad of ['', 'x', 'a.b.c']) {
      expect(await verifyCustomerToken(bad), bad).toBeNull();
    }
  });

  it('carries no role field for a route to misread', async () => {
    const token = await createCustomerToken(CUSTOMER_ID, PHONE);
    const decoded = JSON.parse(
      Buffer.from(token.split('.')[1]!, 'base64url').toString('utf8')
    );
    expect(decoded.role).toBeUndefined();
    expect(decoded.aud).toBe('aeon:customer');
  });
});
