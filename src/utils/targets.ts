import fs from 'node:fs';
import path from 'node:path';

export interface PageTarget { path: string; name: string; group?: string }

export interface Targets {
  name: string;
  baseUrl: string;
  sitemapUrl?: string;
  pages: PageTarget[];
  seo: {
    titleMin: number;
    titleMax: number;
    descriptionMin: number;
    descriptionMax: number;
    requireCanonical: boolean;
    requireOgImage: boolean;
  };
  security: {
    requireHsts: boolean;
    requireCsp: boolean;
    requireFrameOptions: boolean;
    requireNoSniff: boolean;
    requireReferrerPolicy: boolean;
    forbidServerVersion: boolean;
  };
  perf: { maxLoadMs: number; maxTransferKb: number };
  a11y: { tags: string[]; disableRules: string[]; failOn: ('critical' | 'serious' | 'moderate' | 'minor')[] };
  links: { ignorePatterns: string[]; checkExternal: boolean };
  /** Project-specific noise filters. Patterns are regex source strings. */
  noise: { console: string[]; requests: string[]; ignoreStatuses: number[] };
  api: {
    healthPath?: string;
    publicEndpoints: { method: 'get' | 'post'; path: string; expect: number }[];
  };
  /**
   * What this specific install has switched on - e.g. payment gateway in
   * test mode, SMTP configured. BVT specs call requireCapability(name) so a
   * feature that isn't configured on this install shows as a clean "skipped"
   * in the report instead of a false failure.
   */
  capabilities: Record<string, { enabled: boolean; mode?: string; note?: string }>;
}

const DEFAULTS: Omit<Targets, 'name' | 'baseUrl' | 'pages' | 'sitemapUrl'> = {
  seo: {
    titleMin: 20,
    titleMax: 65,
    descriptionMin: 70,
    descriptionMax: 165,
    requireCanonical: true,
    requireOgImage: true,
  },
  security: {
    requireHsts: true,
    requireCsp: true,
    requireFrameOptions: true,
    requireNoSniff: true,
    requireReferrerPolicy: true,
    forbidServerVersion: true,
  },
  perf: { maxLoadMs: 5000, maxTransferKb: 3500 },
  a11y: {
    tags: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'],
    disableRules: [],
    failOn: ['critical', 'serious'],
  },
  links: { ignorePatterns: ['mailto:', 'tel:', 'javascript:', '#'], checkExternal: false },
  noise: { console: [], requests: [], ignoreStatuses: [] },
  api: { publicEndpoints: [] },
  capabilities: {},
};

/**
 * Loads config/targets.json, falling back to targets.example.json so a fresh
 * clone still runs. TARGETS_FILE overrides for multi-environment runs.
 */
export function loadTargets(): Targets {
  const candidates = [
    process.env.TARGETS_FILE,
    path.join('config', 'targets.json'),
    path.join('config', 'targets.example.json'),
  ].filter(Boolean) as string[];

  const found = candidates.find((f) => fs.existsSync(f));
  if (!found) throw new Error(`No targets file found. Looked in: ${candidates.join(', ')}`);

  const parsed = JSON.parse(fs.readFileSync(found, 'utf8')) as Partial<Targets>;
  return {
    name: parsed.name ?? 'unnamed',
    baseUrl: process.env.BASE_URL ?? parsed.baseUrl ?? '',
    sitemapUrl: parsed.sitemapUrl,
    pages: parsed.pages ?? [],
    seo: { ...DEFAULTS.seo, ...(parsed.seo ?? {}) },
    security: { ...DEFAULTS.security, ...(parsed.security ?? {}) },
    perf: { ...DEFAULTS.perf, ...(parsed.perf ?? {}) },
    a11y: { ...DEFAULTS.a11y, ...(parsed.a11y ?? {}) },
    links: { ...DEFAULTS.links, ...(parsed.links ?? {}) },
    noise: { ...DEFAULTS.noise, ...(parsed.noise ?? {}) },
    api: { ...DEFAULTS.api, ...(parsed.api ?? {}) },
    capabilities: { ...DEFAULTS.capabilities, ...(parsed.capabilities ?? {}) },
  };
}

export function absoluteUrl(baseUrl: string, p: string): string {
  return new URL(p, baseUrl).toString();
}

/**
 * Limits how many pages a suite runs against. Keeps PR runs fast while the
 * nightly job covers everything: PAGE_LIMIT=10 npm run smoke
 */
export function limitPages(pages: PageTarget[]): PageTarget[] {
  const limit = Number(process.env.PAGE_LIMIT ?? 0);
  const group = process.env.PAGE_GROUP;
  let list = group ? pages.filter((p) => p.group === group) : pages;
  if (limit > 0) list = list.slice(0, limit);
  return list;
}
