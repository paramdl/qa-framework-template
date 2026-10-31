import { test, expect } from '../../src/fixtures/test-fixtures.js';
import { ApiClient } from '../../src/api/api-client.js';
import { loadTargets } from '../../src/utils/targets.js';

const targets = loadTargets();

test.describe(`api smoke - ${targets.name}`, () => {
  test.skip(
    targets.api.publicEndpoints.length === 0 && !targets.api.healthPath,
    'No API endpoints configured in config/targets.json',
  );

  if (targets.api.healthPath) {
    test('health endpoint responds', async ({ api }) => {
      const res = await api.get(targets.api.healthPath!);
      ApiClient.expectStatus(res, [200, 204]);
    });
  }

  for (const ep of targets.api.publicEndpoints) {
    test(`${ep.method.toUpperCase()} ${ep.path} -> ${ep.expect}`, async ({ api }) => {
      const res = await api.call(ep.method, ep.path);
      ApiClient.expectStatus(res, ep.expect);
    });
  }

  test('unknown route does not leak a stack trace', async ({ api }) => {
    const res = await api.get('/this-route-should-not-exist-qa-probe');
    expect(res.status, 'expected a 404-family status for an unknown route').toBeGreaterThanOrEqual(400);
    expect(
      res.raw,
      'response body exposes an internal stack trace',
    ).not.toMatch(/at\s+\/|node_modules|Traceback|Exception in thread/i);
  });
});
