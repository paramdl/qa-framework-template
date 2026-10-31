#!/usr/bin/env node
/**
 * Full build-verification run for one install: smoke + bvt (guest) + api +
 * authed (if AUTH_ROLES is set), always finishing with the shareable HTML
 * report even when a suite fails.
 *   node scripts/verify.mjs ["Install label"] ["Build/version"]
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import 'dotenv/config';

const [label, version] = process.argv.slice(2);

fs.mkdirSync('reports', { recursive: true });
fs.rmSync(path.join('reports', 'bvt-results.jsonl'), { force: true });
fs.rmSync(path.join('reports', 'findings.jsonl'), { force: true });

const roles = (process.env.AUTH_ROLES ?? '').split(',').map((r) => r.trim()).filter(Boolean);

const steps = [
  ['smoke', ['test', '--project=guest-chromium', 'tests/smoke']],
  ['bvt (guest)', ['test', '--project=guest-chromium', 'tests/bvt']],
  ['api', ['test', '--project=api']],
];
if (roles.length) {
  steps.push(['auth setup', ['test', '--project=setup']]);
  for (const role of roles) steps.push([`bvt (${role})`, ['test', `--project=authed-${role}`]]);
}

// Two Windows spawn pitfalls, both avoided here: (1) spawning npx.cmd
// directly without a shell throws EINVAL (.cmd files need cmd.exe); (2)
// shell:true with an args *array* just space-joins it, silently splitting
// any argument containing a space (a label like "Client - staging" would
// arrive as several argv entries). So: shell:true, but we quote and join
// into one command string ourselves first.
const isWin = process.platform === 'win32';
function quote(arg) {
  if (/^[A-Za-z0-9_.\/:=@-]+$/.test(arg)) return arg;
  return `"${String(arg).replace(/"/g, '""')}"`;
}
function run(cmd, args) {
  if (!isWin) return spawnSync(cmd, args, { stdio: 'inherit' });
  return spawnSync([cmd, ...args].map(quote).join(' '), { stdio: 'inherit', shell: true });
}

let anyFailed = false;
for (const [name, args] of steps) {
  console.log(`\n=== ${name} ===`);
  const res = run('npx', ['playwright', ...args]);
  if (res.status !== 0) {
    anyFailed = true;
    console.log(`(${name} reported failures - continuing so the report covers everything)`);
  }
}

console.log('\n=== building report ===');
const reportArgs = ['scripts/build-report.mjs'];
if (label) reportArgs.push(label);
if (version) reportArgs.push(version);
run('node', reportArgs);

process.exit(anyFailed ? 1 : 0);
