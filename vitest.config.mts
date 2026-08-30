// vitest.config.ts
import { defineConfig } from 'vitest/config';
import path from 'node:path';

const root = import.meta.dirname;

/**
 * Unit tests only, and deliberately so.
 *
 * Everything here runs with no database, no network and no dev server, so
 * `npm test` stays fast enough to run on every change. The DB-backed paths —
 * placeOrder, transitionOrder, the API routes — are exercised against real
 * Postgres by the verification scripts in `scripts/`, which is the right tool
 * for them: mocking a transaction proves nothing about whether the transaction
 * is correct, and the stock-restore race in particular can only be tested
 * against a real database.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(root, '.'),
      // See tests/stubs/server-only.ts — the real package throws outside an
      // RSC render, which would block unit-testing any server module.
      'server-only': path.resolve(root, 'tests/stubs/server-only.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    /**
     * lib/env validates at import time and throws when these are missing, so a
     * unit test could not import ANY module that transitively reaches it —
     * lib/seo/json-ld needs the app URL to absolutise a link.
     *
     * Dummy values, not a relaxed schema: nothing here opens a connection or
     * signs a token, and loosening the real validation to suit the tests would
     * remove the check that a misconfigured deployment fails loudly at boot.
     */
    env: {
      DATABASE_URL: 'postgres://test:test@localhost:5432/test',
      JWT_ACCESS_SECRET: 'test-access-secret-not-used-for-anything-real',
      JWT_REFRESH_SECRET: 'test-refresh-secret-not-used-for-anything-real',
      NEXT_PUBLIC_APP_URL: 'https://example.test',
    },
    coverage: {
      provider: 'v8',
      include: ['lib/**/*.ts'],
      exclude: ['lib/db/**', 'lib/**/*.d.ts'],
    },
  },
});
