import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for Semsar AI frontend E2E tests.
 *
 * Run with: npx playwright test
 * UI mode:  npx playwright test --ui
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false, // negotiation tests need serial execution
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // single worker — tests share state via backend
  reporter: 'html',
  timeout: 30_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: 'http://localhost:5174',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Run backend + frontend before tests
  webServer: [
    {
      command: 'cd ../backend && npm run start:dev',
      url: 'http://localhost:3000/api',
      reuseExistingServer: true,
      timeout: 30_000,
    },
    {
      command: 'npm run dev',
      url: 'http://localhost:5174',
      reuseExistingServer: true,
      timeout: 30_000,
    },
  ],
});
