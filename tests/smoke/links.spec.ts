import { test, expect } from '@playwright/test';
import { loadTargets, absoluteUrl, limitPages } from '../../src/utils/targets.js';
import { recordFinding } from '../../src/utils/report.js';

/**
 * Collects every in-scope href on a page and HEADs it (falling back to GET,
 * since plenty of servers reject HEAD). Statuses are cached across tests in
 * the same worker so shared nav links are not re-fetched dozens of times.
 */
const targets = loadTargets();
const pages = limitPages(targets.pages);
const statusCache = new Map<string, number>();

test.describe(`broken links - ${targets.name}`, () => {
  for (const target of pages) {
    test(`${target.name} (${target.path}) has no broken links`, async ({ page, request }, testInfo) => {
      const url = absoluteUrl(targets.baseUrl, target.path);
      await page.goto(url, { waitUntil: 'domcontentloaded' });

      const hrefs = await page.$$eval('a[href]', (as) =>
        as.map((a) => (a as HTMLAnchorElement).href).filter(Boolean),
      );

      const origin = new URL(targets.baseUrl).origin;
      const unique = [...new Set(hrefs)].filter((h) => {
        if (targets.links.ignorePatterns.some((p) => h.includes(p))) return false;
        if (!/^https?:/i.test(h)) return false;
        if (!targets.links.checkExternal && !h.startsWith(origin)) return false;
        return true;
      });

      const broken: string[] = [];
      for (const href of unique) {
        let status = statusCache.get(href);
        if (status === undefined) {
          let res = await request.head(href, { failOnStatusCode: false, maxRedirects: 5 }).catch(() => null);
          if (!res || res.status() === 405 || res.status() === 501) {
            res = await request.get(href, { failOnStatusCode: false, maxRedirects: 5 }).catch(() => null);
          }
          status = res ? res.status() : 0;
          statusCache.set(href, status);
        }
        if (status === 0) broken.push(`${href} -> request failed`);
        else if (status >= 400) broken.push(`${href} -> HTTP ${status}`);
      }

      await testInfo.attach('links.json', {
        body: JSON.stringify({ checked: unique.length, broken }, null, 2),
        contentType: 'application/json',
      });

      if (broken.length) {
        recordFinding({ page: target.name, url, severity: 'P2', category: 'links', problems: broken });
      }

      expect(broken, `Broken links on ${url} (checked ${unique.length})`).toEqual([]);
    });
  }
});
