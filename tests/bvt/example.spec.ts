import { test, expect } from '../../src/fixtures/test-fixtures.js';
import { loadTargets } from '../../src/utils/targets.js';
import { requireCapability } from '../../src/utils/capabilities.js';

/**
 * Example feature specs for this template - replace with the real flows for
 * whatever product this install runs. BVT tests exercise actual
 * functionality (not just "does the page load", which tests/smoke already
 * covers) and are the suite `npm run verify` runs as part of build
 * verification. Gate anything that depends on payment/SMTP/etc with
 * requireCapability() so an install where that isn't configured shows a
 * clean "skipped" in the report instead of a false failure.
 */
const targets = loadTargets();

test.describe(`core navigation - ${targets.name}`, () => {
  test('primary navigation renders with no client errors', async ({ page, clientErrors }) => {
    await page.goto('/');
    await expect(page.locator('nav, header').first()).toBeVisible();
    expect(clientErrors).toEqual([]);
  });
});

test.describe(`example: gated feature - ${targets.name}`, () => {
  test('checkout flow (requires paymentGateway capability)', async ({ page }) => {
    requireCapability('paymentGateway');
    // Replace with a real subscribe/checkout flow for this product.
    await page.goto('/');
  });

  test('transactional email flow (requires smtp capability)', async ({ page }) => {
    requireCapability('smtp');
    // Replace with a real "trigger an email" flow (e.g. forgot password).
    await page.goto('/');
  });
});
