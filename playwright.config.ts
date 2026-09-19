import { defineConfig, devices } from '@playwright/test'

/*
 * Builds and serves the production app, with no DATABASE_URL. The suite below
 * therefore asserts contracts that hold with or without a database — see the
 * comment in tests/e2e/smoke.spec.ts about what M0 can honestly cover.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  // A test that only passes on a retry is a flaky test; CI should say so.
  retries: 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run build && npm run start',
    url: 'http://localhost:3000/api/health',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})
