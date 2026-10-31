import type { Targets } from '../utils/targets.js';

export interface HeaderCheckResult {
  url: string;
  status: number;
  issues: string[];
  present: Record<string, string | undefined>;
}

/**
 * Header names are case-insensitive per RFC; Playwright lowercases them, but
 * normalize anyway so this works against raw fetch results too.
 */
function lower(headers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
}

export function checkSecurityHeaders(
  url: string,
  status: number,
  rawHeaders: Record<string, string>,
  rules: Targets['security'],
): HeaderCheckResult {
  const h = lower(rawHeaders);
  const issues: string[] = [];

  // CSP may be enforced or report-only; report-only does not protect users.
  const csp = h['content-security-policy'];
  const cspReportOnly = h['content-security-policy-report-only'];
  if (rules.requireCsp) {
    if (!csp && !cspReportOnly) issues.push('Missing Content-Security-Policy');
    else if (!csp && cspReportOnly) {
      issues.push('CSP is Report-Only - policy is not enforced');
    }
  }

  if (rules.requireHsts) {
    const hsts = h['strict-transport-security'];
    if (!hsts) issues.push('Missing Strict-Transport-Security');
    else {
      const maxAge = /max-age=(\d+)/i.exec(hsts)?.[1];
      if (!maxAge || Number(maxAge) < 15552000) {
        issues.push(`HSTS max-age too low or absent: "${hsts}" (expected >= 15552000)`);
      }
    }
  }

  if (rules.requireFrameOptions && !h['x-frame-options']) {
    // frame-ancestors in an ENFORCED CSP is the modern equivalent.
    if (!csp || !/frame-ancestors/i.test(csp)) {
      issues.push('Missing X-Frame-Options and no enforced CSP frame-ancestors');
    }
  }

  if (rules.requireNoSniff && h['x-content-type-options']?.toLowerCase() !== 'nosniff') {
    issues.push('Missing or invalid X-Content-Type-Options (expected "nosniff")');
  }

  if (rules.requireReferrerPolicy && !h['referrer-policy']) {
    issues.push('Missing Referrer-Policy');
  }

  if (rules.forbidServerVersion) {
    const server = h['server'];
    if (server && /\d+\.\d+/.test(server)) {
      issues.push(`Server header leaks version: "${server}"`);
    }
    if (h['x-powered-by']) issues.push(`X-Powered-By leaks stack: "${h['x-powered-by']}"`);
  }

  return {
    url,
    status,
    issues,
    present: {
      csp: csp ?? (cspReportOnly ? `(report-only) ${cspReportOnly.slice(0, 60)}...` : undefined),
      hsts: h['strict-transport-security'],
      xfo: h['x-frame-options'],
      nosniff: h['x-content-type-options'],
      referrerPolicy: h['referrer-policy'],
      permissionsPolicy: h['permissions-policy'],
      server: h['server'],
    },
  };
}
