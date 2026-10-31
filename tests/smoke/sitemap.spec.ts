import { test, expect } from '@playwright/test';
import { collectSitemapUrls } from '../../src/utils/sitemap.js';
import { loadTargets } from '../../src/utils/targets.js';
import { recordFinding } from '../../src/utils/report.js';

/**
 * Validates the sitemap itself, then samples the URLs it declares. A sitemap
 * that lists dead or non-canonical URLs actively wastes crawl budget, so the
 * sample size is tunable: SITEMAP_SAMPLE=50 npm run smoke
 */
const targets = loadTargets();
const SAMPLE = Number(process.env.SITEMAP_SAMPLE ?? 25);

test.describe(`sitemap - ${targets.name}`, () => {
  test.skip(!targets.sitemapUrl, 'No sitemapUrl configured in config/targets.json');
  test.describe.configure({ timeout: 180_000 });

  test('sitemap is reachable and every section parses', async ({ request }, testInfo) => {
    const { entries, sections, errors } = await collectSitemapUrls(request, targets.sitemapUrl!);

    await testInfo.attach('sitemap.json', {
      body: JSON.stringify({ sections, total: entries.length, errors }, null, 2),
      contentType: 'application/json',
    });

    expect(entries.length, 'sitemap declared zero URLs').toBeGreaterThan(0);
    expect(errors, 'sitemap section errors').toEqual([]);
  });

  test(`a sample of sitemap URLs resolve`, async ({ request }, testInfo) => {
    const { entries } = await collectSitemapUrls(request, targets.sitemapUrl!);

    // Spread the sample across sections instead of taking the first N, which
    // would only ever exercise one content type.
    const bySection = new Map<string, string[]>();
    for (const e of entries) {
      const list = bySection.get(e.source) ?? [];
      list.push(e.loc);
      bySection.set(e.source, list);
    }
    const perSection = Math.max(1, Math.floor(SAMPLE / Math.max(1, bySection.size)));
    const sample = [...bySection.values()].flatMap((urls) => urls.slice(0, perSection));

    const problems: string[] = [];
    for (const loc of sample) {
      const res = await request.get(loc, { failOnStatusCode: false, maxRedirects: 5 }).catch(() => null);
      if (!res) problems.push(`${loc} -> request failed`);
      else if (res.status() >= 400) problems.push(`${loc} -> HTTP ${res.status()}`);
    }

    await testInfo.attach('sample.json', {
      body: JSON.stringify({ sampled: sample.length, problems }, null, 2),
      contentType: 'application/json',
    });

    if (problems.length) {
      recordFinding({
        page: 'Sitemap',
        url: targets.sitemapUrl!,
        severity: 'P2',
        category: 'sitemap',
        problems,
      });
    }

    expect(problems, `Dead URLs listed in sitemap (sampled ${sample.length})`).toEqual([]);
  });
});
