#!/usr/bin/env node
/**
 * Renders reports/bvt-results.jsonl (written by src/reporters/bvt-reporter.ts)
 * into one self-contained HTML dashboard - safe to email, drop in a shared
 * folder, or print to PDF. No external assets, no server required.
 *   node scripts/build-report.mjs ["Install label"] ["Build/version"]
 */
import fs from 'node:fs';
import path from 'node:path';
import 'dotenv/config';

const RESULTS = path.join('reports', 'bvt-results.jsonl');
const label = process.argv[2] ?? process.env.INSTALL_LABEL ?? 'Build Verification Run';
const version = process.argv[3] ?? process.env.BUILD_VERSION ?? '';

if (!fs.existsSync(RESULTS)) {
  console.error(`No ${RESULTS} found - run a suite first (npm run verify, or npm run bvt).`);
  process.exit(1);
}

const rows = fs.readFileSync(RESULTS, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));

// Keep the last attempt per test identity - retries re-append the same test.
const byId = new Map();
for (const r of rows) byId.set(`${r.project}|${r.file}|${r.feature}|${r.title}`, r);
const tests = [...byId.values()];

let targets = null;
try {
  const targetsPath = process.env.TARGETS_FILE ?? (fs.existsSync('config/targets.json') ? 'config/targets.json' : 'config/targets.example.json');
  targets = JSON.parse(fs.readFileSync(targetsPath, 'utf8'));
} catch {
  /* report still renders without it */
}

const stats = { passed: 0, failed: 0, skipped: 0, flaky: 0, timedOut: 0 };
for (const t of tests) {
  if (t.flaky) stats.flaky++;
  else if (t.status === 'passed') stats.passed++;
  else if (t.status === 'skipped') stats.skipped++;
  else if (t.status === 'timedOut') stats.timedOut++;
  else stats.failed++;
}
const total = tests.length;
const ran = total - stats.skipped;
const passRate = ran ? Math.round(((stats.passed + stats.flaky) / ran) * 100) : 0;

const byFeature = new Map();
for (const t of tests) {
  const key = t.feature || t.file || 'Other';
  if (!byFeature.has(key)) byFeature.set(key, []);
  byFeature.get(key).push(t);
}

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function statusBadge(t) {
  if (t.flaky) return '<span class="badge flaky">FLAKY</span>';
  const map = { passed: 'pass', failed: 'fail', skipped: 'skip', timedOut: 'fail', interrupted: 'fail' };
  const cls = map[t.status] ?? 'fail';
  const text = t.status === 'timedOut' ? 'TIMEOUT' : t.status.toUpperCase();
  return `<span class="badge ${cls}">${text}</span>`;
}

const featureSections = [...byFeature.entries()]
  .sort((a, b) => a[0].localeCompare(b[0]))
  .map(([feature, list]) => {
    const fails = list.filter((t) => !t.flaky && (t.status === 'failed' || t.status === 'timedOut')).length;
    const rowsHtml = list
      .sort((a, b) => a.title.localeCompare(b.title))
      .map(
        (t) => `
        <tr class="row-${t.flaky ? 'flaky' : t.status}">
          <td>${statusBadge(t)}</td>
          <td>${esc(t.title)}</td>
          <td class="muted">${esc(t.project)}</td>
          <td class="muted">${t.durationMs ? (t.durationMs / 1000).toFixed(1) + 's' : ''}</td>
          <td class="err">${t.error ? esc(t.error.split('\n')[0]).slice(0, 300) : t.skipReason ? esc(t.skipReason) : ''}</td>
        </tr>`,
      )
      .join('');
    return `
      <details class="feature" ${fails > 0 ? 'open' : ''}>
        <summary>
          <span class="feature-name">${esc(feature)}</span>
          <span class="feature-stats">${list.length} test(s)${fails ? ` &middot; <strong>${fails} failing</strong>` : ''}</span>
        </summary>
        <table>
          <thead><tr><th>Status</th><th>Test</th><th>Project</th><th>Duration</th><th>Detail</th></tr></thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </details>`;
  })
  .join('\n');

const capabilities = targets?.capabilities
  ? Object.entries(targets.capabilities)
      .map(
        ([k, v]) =>
          `<span class="cap ${v.enabled ? 'on' : 'off'}">${esc(k)}${v.mode ? ` (${esc(v.mode)})` : ''}: ${v.enabled ? 'tested' : 'skipped'}</span>`,
      )
      .join(' ')
  : '';

const generatedAt = new Date();
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${esc(label)} - Build Verification Report</title>
<style>
  :root { color-scheme: light dark; --pass:#1a7f37; --fail:#cf222e; --skip:#9a6700; --flaky:#8250df; --bg:#ffffff; --fg:#1f2328; --muted:#6e7781; --border:#d0d7de; --card:#f6f8fa; }
  * { box-sizing: border-box; }
  body { margin:0; padding:24px; background:var(--bg); color:var(--fg); font:14px/1.5 -apple-system,Segoe UI,Roboto,Arial,sans-serif; }
  h1 { font-size:20px; margin:0 0 4px; }
  .meta { color:var(--muted); margin-bottom:20px; }
  .cards { display:flex; gap:12px; flex-wrap:wrap; margin-bottom:20px; }
  .card { background:var(--card); border:1px solid var(--border); border-radius:8px; padding:12px 18px; min-width:100px; }
  .card .n { font-size:26px; font-weight:700; display:block; }
  .card.pass .n { color:var(--pass); } .card.fail .n { color:var(--fail); } .card.skip .n { color:var(--skip); } .card.flaky .n { color:var(--flaky); }
  .card .l { color:var(--muted); font-size:12px; text-transform:uppercase; letter-spacing:.03em; }
  .caps { margin-bottom:20px; }
  .cap { display:inline-block; border:1px solid var(--border); border-radius:12px; padding:2px 10px; margin:2px 4px 2px 0; font-size:12px; }
  .cap.on { border-color:var(--pass); color:var(--pass); } .cap.off { border-color:var(--skip); color:var(--skip); }
  details.feature { border:1px solid var(--border); border-radius:8px; margin-bottom:10px; overflow:hidden; }
  summary { cursor:pointer; padding:10px 14px; background:var(--card); display:flex; justify-content:space-between; gap:12px; font-weight:600; list-style:none; }
  summary::-webkit-details-marker { display:none; }
  .feature-stats { font-weight:400; color:var(--muted); font-size:12px; white-space:nowrap; }
  table { width:100%; border-collapse:collapse; }
  th, td { text-align:left; padding:8px 14px; border-top:1px solid var(--border); font-size:13px; vertical-align:top; }
  th { color:var(--muted); font-weight:600; font-size:11px; text-transform:uppercase; }
  .muted { color:var(--muted); white-space:nowrap; }
  .err { color:var(--fail); font-family:ui-monospace,Consolas,monospace; font-size:12px; }
  .badge { display:inline-block; border-radius:4px; padding:1px 8px; font-size:11px; font-weight:700; letter-spacing:.02em; }
  .badge.pass { background:#dafbe1; color:var(--pass); } .badge.fail { background:#ffebe9; color:var(--fail); }
  .badge.skip { background:#fff8c5; color:var(--skip); } .badge.flaky { background:#fbefff; color:var(--flaky); }
  .row-failed, .row-timedOut { background:rgba(207,34,46,.04); }
  footer { margin-top:24px; color:var(--muted); font-size:12px; }
  @media print { details.feature { break-inside: avoid; } summary { cursor:default; } body { padding:0; } }
  @media (prefers-color-scheme: dark) {
    :root { --bg:#0d1117; --fg:#e6edf3; --border:#30363d; --card:#161b22; }
    .badge.pass{background:#12261e;} .badge.fail{background:#2d1214;} .badge.skip{background:#2b2111;} .badge.flaky{background:#241429;}
  }
</style></head>
<body>
  <h1>${esc(label)} &mdash; Build Verification Report</h1>
  <div class="meta">
    ${targets?.baseUrl ? `Target: <strong>${esc(targets.baseUrl)}</strong> &middot; ` : ''}
    ${version ? `Build/version: <strong>${esc(version)}</strong> &middot; ` : ''}
    Generated ${esc(generatedAt.toString())}
  </div>
  <div class="cards">
    <div class="card"><span class="n">${total}</span><span class="l">Total</span></div>
    <div class="card pass"><span class="n">${stats.passed}</span><span class="l">Passed</span></div>
    <div class="card fail"><span class="n">${stats.failed + stats.timedOut}</span><span class="l">Failed</span></div>
    <div class="card skip"><span class="n">${stats.skipped}</span><span class="l">Skipped</span></div>
    <div class="card flaky"><span class="n">${stats.flaky}</span><span class="l">Flaky</span></div>
    <div class="card"><span class="n">${passRate}%</span><span class="l">Pass rate (of run)</span></div>
  </div>
  ${capabilities ? `<div class="caps">${capabilities}</div>` : ''}
  ${featureSections || '<p>No results found.</p>'}
  <footer>Single self-contained HTML file - safe to email or drop in a shared folder. Use your browser's Print &rarr; Save as PDF to export a PDF copy.</footer>
</body></html>`;

fs.mkdirSync('reports', { recursive: true });
const stamp = generatedAt.toISOString().replace(/[:.]/g, '-');
const outFile = path.join('reports', `bvt-report-${stamp}.html`);
fs.writeFileSync(outFile, html);
fs.writeFileSync(path.join('reports', 'bvt-report-latest.html'), html);

console.log(`Wrote ${outFile}`);
console.log('Wrote reports/bvt-report-latest.html');
console.log(
  `${stats.passed} passed, ${stats.failed + stats.timedOut} failed, ${stats.skipped} skipped, ${stats.flaky} flaky (${passRate}% pass rate of ${ran} run)`,
);
