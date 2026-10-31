import type { Reporter, TestCase, TestResult, FullResult } from '@playwright/test/reporter';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Flattens every finished test to one JSONL record, appended (not
 * overwritten) so scripts/verify.mjs can chain several `playwright test`
 * invocations (smoke, bvt, api, authed) into one combined report. Consumed
 * by scripts/build-report.mjs to render the shareable HTML dashboard.
 */
export default class BvtReporter implements Reporter {
  private lines: string[] = [];

  onTestEnd(test: TestCase, result: TestResult): void {
    const skipAnnotation = test.annotations.find((a) => a.type === 'skip' || a.type === 'fixme');
    const record = {
      feature: test.parent?.title || 'Other',
      title: test.title,
      project: test.parent?.project()?.name ?? '',
      file: test.location.file,
      status: result.status,
      flaky: test.outcome() === 'flaky',
      durationMs: result.duration,
      retries: result.retry,
      error: result.errors[0]?.message?.replace(/\x1b\[[0-9;]*m/g, '') ?? null,
      skipReason: skipAnnotation?.description ?? null,
    };
    this.lines.push(JSON.stringify(record));
  }

  onEnd(_result: FullResult): void {
    fs.mkdirSync('reports', { recursive: true });
    fs.appendFileSync(path.join('reports', 'bvt-results.jsonl'), this.lines.map((l) => l + '\n').join(''));
  }
}
