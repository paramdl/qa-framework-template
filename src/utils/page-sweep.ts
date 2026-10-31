import type { Page, Response } from '@playwright/test';

export interface RequestFailure {
  url: string;
  status: number | null;
  method: string;
  reason?: string;
}

export interface SweepResult {
  url: string;
  finalUrl: string;
  status: number | null;
  loadMs: number;
  consoleErrors: string[];
  pageErrors: string[];
  failedRequests: RequestFailure[];
  seo: {
    title: string | null;
    titleLength: number;
    metaDescription: string | null;
    metaDescriptionLength: number;
    h1s: string[];
    canonical: string | null;
    robots: string | null;
    ogTitle: string | null;
    ogImage: string | null;
    lang: string | null;
    imagesMissingAlt: number;
  };
}

/**
 * Baseline noise that is never a defect on any project. Project-specific
 * noise (third-party beacons, expected auth failures) belongs in the `noise`
 * block of config/targets.json, not here.
 */
const BASE_IGNORED_CONSOLE = [
  /favicon\.ico/i,
  /Download the React DevTools/i,
  /\[HMR\]/i,
  /webpack-dev-server/i,
];

const BASE_IGNORED_REQUESTS = [/favicon\.ico/i, /\/__nextjs/i, /hot-update/i];

export interface NoiseConfig {
  console?: string[];
  requests?: string[];
  /** Statuses treated as expected rather than defects, e.g. 401 when logged out. */
  ignoreStatuses?: number[];
}

function compile(patterns: string[] | undefined): RegExp[] {
  return (patterns ?? []).map((p) => new RegExp(p, 'i'));
}

function isNoise(text: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(text));
}

/**
 * Loads one URL and returns every signal we normally have to gather by hand:
 * console errors, uncaught exceptions, failed requests, and the SEO basics.
 */
export async function sweepPage(page: Page, url: string, noise: NoiseConfig = {}): Promise<SweepResult> {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const failedRequests: RequestFailure[] = [];

  const ignoredConsole = [...BASE_IGNORED_CONSOLE, ...compile(noise.console)];
  const ignoredRequests = [...BASE_IGNORED_REQUESTS, ...compile(noise.requests)];
  const ignoredStatuses = new Set(noise.ignoreStatuses ?? []);

  const onConsole = (msg: { type: () => string; text: () => string }) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (!isNoise(text, ignoredConsole)) consoleErrors.push(text);
  };
  const onPageError = (err: Error) => pageErrors.push(err.message);
  const onResponse = (res: Response) => {
    if (res.status() < 400) return;
    if (ignoredStatuses.has(res.status())) return;
    if (isNoise(res.url(), ignoredRequests)) return;
    failedRequests.push({ url: res.url(), status: res.status(), method: res.request().method() });
  };
  const onRequestFailed = (req: { url: () => string; method: () => string; failure: () => { errorText: string } | null }) => {
    if (isNoise(req.url(), ignoredRequests)) return;
    failedRequests.push({
      url: req.url(),
      status: null,
      method: req.method(),
      reason: req.failure()?.errorText ?? 'request failed',
    });
  };

  page.on('console', onConsole);
  page.on('pageerror', onPageError);
  page.on('response', onResponse);
  page.on('requestfailed', onRequestFailed);

  const started = Date.now();
  let status: number | null = null;
  try {
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    status = response?.status() ?? null;
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {
      /* networkidle never settles on polling/analytics-heavy pages - not a defect */
    });
  } finally {
    // Detach before evaluating so our own probes cannot pollute the results.
    page.off('console', onConsole);
    page.off('pageerror', onPageError);
    page.off('response', onResponse);
    page.off('requestfailed', onRequestFailed);
  }
  const loadMs = Date.now() - started;

  const seo = await page.evaluate(() => {
    const attr = (sel: string, name: string) =>
      document.querySelector(sel)?.getAttribute(name)?.trim() ?? null;
    const title = document.title?.trim() || null;
    const metaDescription = attr('meta[name="description" i]', 'content');
    return {
      title,
      titleLength: title?.length ?? 0,
      metaDescription,
      metaDescriptionLength: metaDescription?.length ?? 0,
      h1s: Array.from(document.querySelectorAll('h1')).map((h) => (h.textContent ?? '').trim()),
      canonical: attr('link[rel="canonical" i]', 'href'),
      robots: attr('meta[name="robots" i]', 'content'),
      ogTitle: attr('meta[property="og:title" i]', 'content'),
      ogImage: attr('meta[property="og:image" i]', 'content'),
      lang: document.documentElement.getAttribute('lang'),
      imagesMissingAlt: Array.from(document.querySelectorAll('img')).filter(
        (i) => !i.hasAttribute('alt'),
      ).length,
    };
  });

  return {
    url,
    finalUrl: page.url(),
    status,
    loadMs,
    consoleErrors,
    pageErrors,
    failedRequests,
    seo,
  };
}
