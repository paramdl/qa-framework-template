import { test, expect } from '../../src/fixtures/test-fixtures.js';

/**
 * Runs once per role in AUTH_ROLES using the saved storageState.
 * Keep this file as the guard that proves auth reuse still works - when it
 * fails, every other authed failure downstream is noise.
 */
test.describe('authenticated session', () => {
  test('session is restored without logging in again', async ({ page, clientErrors }) => {
    await page.goto('/');

    // Landing back on a login screen means storageState expired or was saved
    // from a failed login.
    await expect(page, 'redirected to login - storageState is stale').not.toHaveURL(/login|signin/i);

    expect(clientErrors, 'client-side errors on the authenticated landing page').toEqual([]);
  });
});
