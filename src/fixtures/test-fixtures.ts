import { test as base, expect, type APIRequestContext } from '@playwright/test';
import { ApiClient } from '../api/api-client.js';

export interface Fixtures {
  /** Console errors + uncaught exceptions collected for the whole test. */
  clientErrors: string[];
  /** Thin API wrapper with logging and status helpers. */
  api: ApiClient;
}

export const test = base.extend<Fixtures>({
  clientErrors: async ({ page }, use) => {
    const errors: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(`console: ${m.text()}`);
    });
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    await use(errors);
  },

  api: async ({ playwright }, use) => {
    const ctx: APIRequestContext = await playwright.request.newContext({
      baseURL: process.env.API_BASE_URL ?? process.env.BASE_URL,
      extraHTTPHeaders: process.env.API_TOKEN
        ? { Authorization: `Bearer ${process.env.API_TOKEN}` }
        : {},
      ignoreHTTPSErrors: true,
    });
    await use(new ApiClient(ctx));
    await ctx.dispose();
  },
});

export { expect };
