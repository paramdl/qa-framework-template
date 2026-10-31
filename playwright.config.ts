import { defineConfig, devices } from '@playwright/test';
import 'dotenv/config';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';
const ROLES = (process.env.AUTH_ROLES ?? '').split(',').map((r) => r.trim()).filter(Boolean);

/**
 * Projects:
 *   setup            - logs in once per role, writes .auth/<role>.json
 *   guest-chromium   - logged-out surface (page sweeps, SEO, public pages)
 *   authed-<role>    - one project per role in AUTH_ROLES, reusing storageState
 *   api              - no browser, pure request-context tests
 */
export default defineConfig({
  testDir: './tests',
  outputDir: './test-results',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 4 : undefined,
  timeout: 45_000,
  expect: { timeout: 10_000 },

  reporter: [
    ['list'],
    ['html', { outputFolder: 'reports/html', open: 'never' }],
    ['junit', { outputFile: 'reports/junit.xml' }],
    ['json', { outputFile: 'reports/results.json' }],
    ['./src/reporters/bvt-reporter.ts'],
  ],

  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    ignoreHTTPSErrors: true,
  },

  projects: [
    {
      name: 'setup',
      testMatch: '**/*.setup.ts',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // testIgnore rather than testMatch: a new tests/<area> folder is picked
      // up automatically instead of needing a config edit.
      name: 'guest-chromium',
      use: { ...devices['Desktop Chrome'], storageState: { cookies: [], origins: [] } },
      testIgnore: ['**/*.setup.ts', 'api/**', 'authed/**'],
    },
    ...ROLES.map((role) => ({
      name: `authed-${role}`,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], storageState: `.auth/${role}.json` },
      testMatch: 'authed/**/*.spec.ts',
    })),
    {
      name: 'api',
      testMatch: 'api/**/*.spec.ts',
      use: { baseURL: process.env.API_BASE_URL ?? BASE_URL },
    },
  ],
});
