import fs from 'node:fs';
import path from 'node:path';

export type Severity = 'P1' | 'P2' | 'P3';

export interface Finding {
  page: string;
  url: string;
  severity: Severity;
  /** e.g. page-error, seo, security-headers, accessibility, links, performance */
  category: string;
  problems: string[];
}

const REPORT_DIR = 'reports';
const FINDINGS_FILE = path.join(REPORT_DIR, 'findings.jsonl');

/**
 * Appends one finding as JSONL. Parallel workers each append, so never
 * rewrite the file - append-only is what keeps this safe across workers.
 */
export function recordFinding(finding: Finding): void {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.appendFileSync(
    FINDINGS_FILE,
    JSON.stringify({ ...finding, at: new Date().toISOString() }) + '\n',
  );
}

export function readFindings(): (Finding & { at: string })[] {
  if (!fs.existsSync(FINDINGS_FILE)) return [];
  return fs
    .readFileSync(FINDINGS_FILE, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}
