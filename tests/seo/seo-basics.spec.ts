import { test, expect } from '@playwright/test';
import { sweepPage } from '../../src/utils/page-sweep.js';
import { loadTargets, absoluteUrl, limitPages } from '../../src/utils/targets.js';
import { recordFinding } from '../../src/utils/report.js';

/**
 * The SEO checks that come up on every site audit. Thresholds live in
 * config/targets.json so a client with different house rules just edits JSON.
 */
const targets = loadTargets();
const pages = limitPages(targets.pages);
const { seo } = targets;

test.describe(`seo basics - ${targets.name}`, () => {
  for (const target of pages) {
    test(`${target.name} (${target.path}) meta is complete`, async ({ page }, testInfo) => {
      const url = absoluteUrl(targets.baseUrl, target.path);
      const { seo: found } = await sweepPage(page, url);

      await testInfo.attach('seo.json', {
        body: JSON.stringify(found, null, 2),
        contentType: 'application/json',
      });

      const issues: string[] = [];

      if (!found.title) issues.push('Missing <title>');
      else if (found.titleLength < seo.titleMin || found.titleLength > seo.titleMax) {
        issues.push(`Title length ${found.titleLength} outside ${seo.titleMin}-${seo.titleMax}`);
      }

      if (!found.metaDescription) issues.push('Missing meta description');
      else if (
        found.metaDescriptionLength < seo.descriptionMin ||
        found.metaDescriptionLength > seo.descriptionMax
      ) {
        issues.push(
          `Meta description length ${found.metaDescriptionLength} outside ${seo.descriptionMin}-${seo.descriptionMax}`,
        );
      }

      if (found.h1s.length === 0) issues.push('No <h1> on page');
      else if (found.h1s.length > 1) issues.push(`${found.h1s.length} <h1> elements (expected 1)`);

      if (seo.requireCanonical && !found.canonical) issues.push('Missing canonical link');
      if (seo.requireOgImage && !found.ogImage) issues.push('Missing og:image');
      if (!found.lang) issues.push('Missing <html lang>');

      // Catches the localhost-in-production leak seen on past audits.
      for (const [label, value] of Object.entries({ canonical: found.canonical, ogImage: found.ogImage })) {
        if (value && /localhost|127\.0\.0\.1|\.local\b/i.test(value)) {
          issues.push(`${label} points at a local address: ${value}`);
        }
      }

      if (found.robots && /noindex/i.test(found.robots)) {
        issues.push(`robots meta contains noindex: "${found.robots}"`);
      }

      if (found.imagesMissingAlt > 0) {
        issues.push(`${found.imagesMissingAlt} image(s) missing alt attribute`);
      }

      if (issues.length) {
        recordFinding({ page: target.name, url, severity: 'P3', category: 'seo', problems: issues });
      }

      expect(issues, `SEO issues on ${url}`).toEqual([]);
    });
  }
});
