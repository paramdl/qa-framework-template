#!/usr/bin/env node
/** Clears accumulated BVT results before starting a fresh campaign. */
import fs from 'node:fs';
import path from 'node:path';

for (const f of ['bvt-results.jsonl', 'findings.jsonl']) {
  fs.rmSync(path.join('reports', f), { force: true });
}
console.log('Cleared reports/bvt-results.jsonl and reports/findings.jsonl');
