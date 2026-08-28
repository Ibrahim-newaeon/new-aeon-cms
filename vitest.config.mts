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
    coverage: {
      provider: 'v8',
      include: ['lib/**/*.ts'],
      exclude: ['lib/db/**', 'lib/**/*.d.ts'],
    },
  },
});
