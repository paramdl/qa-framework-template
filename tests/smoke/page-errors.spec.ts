import { test, expect } from '@playwright/test';
import { sweepPage } from '../../src/utils/page-sweep.js';
import { loadTargets, absoluteUrl, limitPages } from '../../src/utils/targets.js';
import { recordFinding } from '../../src/utils/report.js';

/**
 * Data-driven page sweep: every URL in config/targets.json is checked for
 * HTTP errors, console errors, uncaught exceptions, and broken sub-requests.
 * This is the logged-out surface check that starts every engagement.
 */
const targets = loadTargets();
const pages = limitPages(targets.pages);

test.describe(`page errors - ${targets.name}`, () => {
  for (const target of pages) {
    test(`${target.name} (${target.path}) loads clean`, async ({ page }, testInfo) => {
      const url = absoluteUrl(targets.baseUrl, target.path);
      const result = await sweepPage(page, url, targets.noise);

      await testInfo.attach('sweep.json', {
        body: JSON.stringify(result, null, 2),
        contentType: 'application/json',
      });

      const problems: string[] = [];
      if (result.status === null || result.status >= 400) {
        problems.push(`HTTP ${result.status} on ${url}`);
      }
      for (const e of result.pageErrors) problems.push(`Uncaught exception: ${e}`);
      for (const e of result.consoleErrors) problems.push(`Console error: ${e}`);
      for (const r of result.failedRequests) {
        problems.push(`Failed request ${r.method} ${r.url} -> ${r.status ?? r.reason}`);
      }

      if (problems.length) {
        recordFinding({
          page: target.name,
          url,
          severity: result.status === null || result.status >= 500 ? 'P1' : 'P2',
          category: 'page-error',
          problems,
        });
      }

      expect(problems, `${problems.length} problem(s) on ${url}`).toEqual([]);
    });
  }
});
