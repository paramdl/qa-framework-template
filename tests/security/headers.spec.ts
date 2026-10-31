import { test, expect } from '@playwright/test';
import { checkSecurityHeaders } from '../../src/checks/security-headers.js';
import { loadTargets, absoluteUrl, limitPages } from '../../src/utils/targets.js';
import { recordFinding } from '../../src/utils/report.js';

const targets = loadTargets();
const pages = limitPages(targets.pages);

test.describe(`security headers - ${targets.name}`, () => {
  for (const target of pages) {
    test(`${target.name} (${target.path}) sends the expected headers`, async ({ request }, testInfo) => {
      const url = absoluteUrl(targets.baseUrl, target.path);
      const res = await request.get(url, { failOnStatusCode: false, maxRedirects: 5 });
      const result = checkSecurityHeaders(url, res.status(), res.headers(), targets.security);

      await testInfo.attach('headers.json', {
        body: JSON.stringify(result, null, 2),
        contentType: 'application/json',
      });

      if (result.issues.length) {
        recordFinding({
          page: target.name,
          url,
          severity: 'P2',
          category: 'security-headers',
          problems: result.issues,
        });
      }

      expect(result.issues, `Security header issues on ${url}`).toEqual([]);
    });
  }
});
