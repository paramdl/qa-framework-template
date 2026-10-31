#!/usr/bin/env node
/**
 * Turns reports/findings.jsonl into markdown + CSV.
 *   node scripts/summarize.mjs "Client Name"
 *
 * Facts only - what was observed, where. No recommended fixes.
 */
import fs from 'node:fs';
import path from 'node:path';

const FINDINGS = path.join('reports', 'findings.jsonl');
const projectName = process.argv[2] ?? 'QA Run';

if (!fs.existsSync(FINDINGS)) {
  console.log('No findings file - nothing to summarize.');
  process.exit(0);
}

const raw = fs.readFileSync(FINDINGS, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));

// Retries re-append the same finding; collapse on page+category+problem set.
const seen = new Set();
const findings = [];
for (const f of raw) {
  const key = `${f.url}|${f.category}|${f.problems.join('|')}`;
  if (seen.has(key)) continue;
  seen.add(key);
  findings.push(f);
}

const SEVERITIES = ['P1', 'P2', 'P3'];
const bySeverity = Object.fromEntries(SEVERITIES.map((s) => [s, []]));
const byCategory = {};
for (const f of findings) {
  (bySeverity[f.severity] ??= []).push(f);
  (byCategory[f.category] ??= []).push(f);
}

const lines = [
  `# ${projectName} - Findings`,
  '',
  `Generated: ${new Date().toISOString()}`,
  `Unique findings: ${findings.length} (from ${raw.length} recorded, retries collapsed)`,
  '',
  '## By severity',
  '',
  '| Severity | Count |',
  '|---|---|',
  ...SEVERITIES.map((s) => `| ${s} | ${bySeverity[s].length} |`),
  '',
  '## By category',
  '',
  '| Category | Count |',
  '|---|---|',
  ...Object.entries(byCategory)
    .sort((a, b) => b[1].length - a[1].length)
    .map(([c, l]) => `| ${c} | ${l.length} |`),
  '',
];

for (const sev of SEVERITIES) {
  const list = bySeverity[sev];
  if (!list.length) continue;
  lines.push(`## ${sev}`, '');
  for (const f of list) {
    lines.push(`### ${f.page} - ${f.category}`, '', `- URL: ${f.url}`, '- Observed:');
    for (const p of f.problems) lines.push(`  - ${p}`);
    lines.push('');
  }
}

fs.writeFileSync(path.join('reports', 'FINDINGS.md'), lines.join('\n'));

// CSV for the tracker.
const esc = (v) => `"${String(v).replace(/"/g, '""')}"`;
const csv = [
  'id,severity,category,page,url,observed',
  ...findings.map((f, i) =>
    [
      `F-${String(i + 1).padStart(3, '0')}`,
      f.severity,
      f.category,
      esc(f.page),
      esc(f.url),
      esc(f.problems.join(' | ')),
    ].join(','),
  ),
].join('\n');
fs.writeFileSync(path.join('reports', 'findings.csv'), csv);

console.log(`Wrote reports/FINDINGS.md and reports/findings.csv (${findings.length} unique finding(s))`);
