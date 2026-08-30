// playwright.config.ts
import { defineConfig, devices } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { STORAGE_STATE } from './e2e/fixtures';

/**
 * Playwright does not read .env, but globalSetup needs DATABASE_URL and
 * `next start` inherits this process's environment. Parsed by hand rather than
 * adding dotenv for one file. Real environment variables win, so CI can
 * override without editing anything.
 */
try {
  for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key!] !== undefined) continue;
    process.env[key!] = rawValue!.trim().replace(/^["']|["']$/g, '');
  }
} catch {
  // No .env — CI is expected to provide the variables directly.
}

/**
 * Browser tests, run against a production build rather than `next dev`.
 *
 * Dev compiles a route on first request, which turns an ordinary assertion into
 * a 30-second timeout and makes failures look like flakiness. `next start`
 * serves what actually ships and is fast enough that the timeouts below are
 * generous rather than load-bearing. `npm run test:e2e` builds first.
 *
 * Port 3100, not 3000, so a dev server someone already has running is neither
 * clobbered nor accidentally tested. See also the note in
 * memory: building while dev runs corrupts `.next`.
 */
const PORT = Number(process.env.E2E_PORT ?? 3100);
const BASE_URL = `http://127.0.0.1:${PORT}`;

/**
 * A per-worker client address.
 *
 * Login is rate-limited to 5 attempts per IP per 15 minutes, which is exactly
 * the kind of real protection that makes a browser suite flake on its third
 * run of the afternoon. Every request carries a synthetic X-Forwarded-For, so
 * each worker gets its own bucket and reruns never inherit the last one's
 * count. It also means the tests exercise the header the limiter actually keys
 * on.
 */
const workerIp = `10.90.${process.pid % 256}.${(Date.now() % 250) + 1}`;

export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results',
  fullyParallel: false, // several specs mutate shared catalogue stock
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],

  globalSetup: './e2e/global-setup.ts',

  use: {
    baseURL: BASE_URL,
    // The app instruments with `data-test-id`; Playwright's default is
    // `data-testid`, so without this every getByTestId silently finds nothing.
    testIdAttribute: 'data-test-id',
    extraHTTPHeaders: { 'x-forwarded-for': workerIp },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },

  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // The setup project WRITES this file; without loading it here every
        // signed-in spec runs anonymously and fails on elements that are simply
        // not rendered for a logged-out visitor.
        storageState: STORAGE_STATE,
      },
      dependencies: ['setup'],
    },
  ],

  webServer: {
    // NEXT_STANDALONE=0 here as well as in the build script: next.config is
    // re-read by `next start`, and without it the server warns that it cannot
    // serve a standalone build even though the build itself was not one.
    command: `NEXT_STANDALONE=0 npx next start --port ${PORT}`,
    url: `${BASE_URL}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
