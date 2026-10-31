import { test } from '@playwright/test';
import { loadTargets } from './targets.js';

/**
 * Skips the current test when a capability isn't enabled for this install -
 * e.g. `requireCapability('paymentGateway')` at the top of a checkout test,
 * so a run against a site where the gateway isn't configured shows a clean
 * "skipped - not configured" in the report instead of a false failure.
 *
 * Set in config/targets.json:
 *   "capabilities": { "paymentGateway": { "enabled": true, "mode": "test", "note": "Stripe - checkout, subscriptions" } }
 */
export function requireCapability(name: string): void {
  const cap = loadTargets().capabilities[name];
  const detail = cap?.note ? ` (${cap.note})` : '';
  test.skip(!cap?.enabled, `Capability "${name}" is not enabled for this install${detail}`);
}
