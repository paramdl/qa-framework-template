import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { loadTargets, absoluteUrl, limitPages } from '../../src/utils/targets.js';
import { recordFinding } from '../../src/utils/report.js';

/**
 * WCAG scan per page. Only impacts listed in targets.a11y.failOn fail the
 * build; everything else is still attached to the report for triage.
 */
const targets = loadTargets();
const pages = limitPages(targets.pages);
const { a11y } = targets;

test.describe(`accessibility - ${targets.name}`, () => {
  for (const target of pages) {
    test(`${target.name} (${target.path}) has no blocking a11y violations`, async ({ page }, testInfo) => {
      const url = absoluteUrl(targets.baseUrl, target.path);
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});

      let builder = new AxeBuilder({ page }).withTags(a11y.tags);
      if (a11y.disableRules.length) builder = builder.disableRules(a11y.disableRules);
      const results = await builder.analyze();

      await testInfo.attach('axe-violations.json', {
        body: JSON.stringify(results.violations, null, 2),
        contentType: 'application/json',
      });

      const blocking = results.violations.filter((v) =>
        (a11y.failOn as string[]).includes(v.impact ?? ''),
      );

      const problems = blocking.map(
        (v) => `[${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} node(s)) - ${v.helpUrl}`,
      );

      if (problems.length) {
        recordFinding({ page: target.name, url, severity: 'P2', category: 'accessibility', problems });
      }

      expect(problems, `Blocking a11y violations on ${url}`).toEqual([]);
    });
  }
});
