import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for El Impostor E2E tests.
 *
 * Strategy:
 *   - Single Chromium project (matches production; no Safari/Firefox matrix
 *     for now — the codebase is browser-agnostic and Chromium covers ~70%
 *     of the user base).
 *   - webServer boots a fresh dev stack per run (build:shared + dev:server).
 *     The server serves `client/dist` statically and exposes the WS endpoint.
 *   - Tests are NOT parallel: the game is stateful and a single host
 *     instance is shared across all E2E suites. Running suites in
 *     parallel would cause cross-test interference (rooms named the same
 *     code, race conditions on public rooms list, etc.).
 *   - trace/screenshot/video on failure to make triage painless.
 *
 * Port 3001 is the server port. We do NOT use Vite for E2E — that would
 * add a hop and lose the production-like static-serve path. The
 * `pnpm dev` script does build:shared + dev:server which is what
 * production runs against, minus the systemd wrapper.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // game state is shared; see header
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // The dev server boots once per run; running multiple workers
  // against the same port causes port-in-use errors.
  workers: 1,
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
  ],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: 'http://localhost:3001',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Lock to English so selectors like "Create room" / "Join" are
        // stable. Tests that exercise locale-switching set the locale
        // explicitly via the LanguageSelector.
        locale: 'en-US',
      },
    },
    {
      name: 'firefox',
      use: {
        ...devices['Desktop Firefox'],
        locale: 'en-US',
      },
    },
    {
      name: 'webkit',
      use: {
        ...devices['Desktop Safari'],
        locale: 'en-US',
      },
    },
  ],
  webServer: {
    command: 'pnpm build:all && pnpm dev:server',
    url: 'http://localhost:3001/health',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
