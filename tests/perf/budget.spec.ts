import { test, expect } from '@playwright/test';
import { loadTargets, absoluteUrl, limitPages } from '../../src/utils/targets.js';
import { recordFinding } from '../../src/utils/report.js';

/**
 * Page-weight and load-time budget. Not a substitute for field Core Web
 * Vitals, but it catches the regressions that cause them: a page that
 * suddenly ships 4MB of JavaScript.
 */
const targets = loadTargets();
const pages = limitPages(targets.pages);

test.describe(`performance budget - ${targets.name}`, () => {
  for (const target of pages) {
    test(`${target.name} (${target.path}) stays within budget`, async ({ page }, testInfo) => {
      const url = absoluteUrl(targets.baseUrl, target.path);

      let transferBytes = 0;
      page.on('response', (res) => {
        const len = Number(res.headers()['content-length'] ?? 0);
        if (!Number.isNaN(len)) transferBytes += len;
      });

      const started = Date.now();
      await page.goto(url, { waitUntil: 'load' });
      const loadMs = Date.now() - started;

      const timing = await page.evaluate(() => {
        const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
        const fcp = performance.getEntriesByName('first-contentful-paint')[0];
        return {
          domContentLoaded: nav ? Math.round(nav.domContentLoadedEventEnd) : null,
          loadEvent: nav ? Math.round(nav.loadEventEnd) : null,
          ttfb: nav ? Math.round(nav.responseStart) : null,
          firstContentfulPaint: fcp ? Math.round(fcp.startTime) : null,
          resources: performance.getEntriesByType('resource').length,
        };
      });

      const transferKb = Math.round(transferBytes / 1024);
      const metrics = { url, loadMs, transferKb, ...timing };

      await testInfo.attach('perf.json', {
        body: JSON.stringify(metrics, null, 2),
        contentType: 'application/json',
      });

      const problems: string[] = [];
      if (loadMs > targets.perf.maxLoadMs) {
        problems.push(`Load took ${loadMs}ms (budget ${targets.perf.maxLoadMs}ms)`);
      }
      // content-length is absent on chunked responses, so a 0 here means
      // "could not measure", not "weighs nothing" - don't report it as a pass.
      if (transferKb > targets.perf.maxTransferKb) {
        problems.push(`Transferred ${transferKb}KB (budget ${targets.perf.maxTransferKb}KB)`);
      }

      if (problems.length) {
        recordFinding({ page: target.name, url, severity: 'P3', category: 'performance', problems });
      }

      expect(problems, `Budget exceeded on ${url}`).toEqual([]);
    });
  }
});
