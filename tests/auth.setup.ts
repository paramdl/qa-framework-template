import { test as setup, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Runs once before the authed-* projects. Logs in per role and persists
 * storageState, so no other test ever pays the login cost again.
 *
 * Configure per project in .env:
 *   AUTH_ROLES=admin,creator,fan
 *   ADMIN_USERNAME=... ADMIN_PASSWORD=... ADMIN_LOGIN_PATH=/admin/login
 *
 * Selectors default to common patterns; override per role when a site differs.
 */

const ROLES = (process.env.AUTH_ROLES ?? '').split(',').map((r) => r.trim()).filter(Boolean);

function cfg(role: string, key: string, fallback = ''): string {
  const R = role.toUpperCase().replace(/[^A-Z0-9]/g, '_');
  return process.env[`${R}_${key}`] ?? process.env[`DEFAULT_${key}`] ?? fallback;
}

for (const role of ROLES) {
  setup(`authenticate ${role}`, async ({ page }) => {
    const username = cfg(role, 'USERNAME');
    const password = cfg(role, 'PASSWORD');
    setup.skip(!username || !password, `No credentials configured for role "${role}"`);

    const loginPath = cfg(role, 'LOGIN_PATH', '/login');
    const userSel = cfg(role, 'USER_SELECTOR', 'input[name="email"], input[type="email"], input[name="username"]');
    const passSel = cfg(role, 'PASS_SELECTOR', 'input[name="password"], input[type="password"]');
    const submitSel = cfg(role, 'SUBMIT_SELECTOR', 'button[type="submit"]');
    const successPath = cfg(role, 'SUCCESS_PATH', '');
    const successText = cfg(role, 'SUCCESS_TEXT', '');

    await page.goto(loginPath, { waitUntil: 'domcontentloaded' });
    await page.locator(userSel).first().fill(username);
    await page.locator(passSel).first().fill(password);
    await page.locator(submitSel).first().click();

    // Prove the login actually worked - a saved storageState from a failed
    // login is the single most common cause of "mystery" authed failures.
    if (successPath) {
      await page.waitForURL(new RegExp(successPath), { timeout: 30_000 });
    } else {
      await expect(page).not.toHaveURL(new RegExp(loginPath), { timeout: 30_000 });
    }
    if (successText) {
      await expect(page.getByText(successText).first()).toBeVisible({ timeout: 15_000 });
    }

    const file = path.join('.auth', `${role}.json`);
    fs.mkdirSync('.auth', { recursive: true });
    await page.context().storageState({ path: file });
    // eslint-disable-next-line no-console
    console.log(`[auth] ${role} -> ${file}`);
  });
}

if (ROLES.length === 0) {
  setup('no roles configured', async () => {
    setup.skip(true, 'AUTH_ROLES is empty - guest-only run');
  });
}
