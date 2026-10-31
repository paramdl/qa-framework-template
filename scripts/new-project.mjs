#!/usr/bin/env node
/**
 * Clones this template into a new sibling folder.
 *   node scripts/new-project.mjs Acme https://acme.com
 */
import fs from 'node:fs';
import path from 'node:path';

const [name, baseUrl, destArg] = process.argv.slice(2);
if (!name) {
  console.error('Usage: node scripts/new-project.mjs <ProjectName> [baseUrl] [destPath]');
  process.exit(1);
}

const SRC = process.cwd();
const DEST = destArg ? path.resolve(destArg) : path.resolve(SRC, '..', `${name}-QA`);

if (fs.existsSync(DEST)) {
  console.error(`Refusing to overwrite existing folder: ${DEST}`);
  process.exit(1);
}

const SKIP = new Set(['node_modules', '.git', '.auth', 'reports', 'test-results', 'playwright-report', '.env']);

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const s = path.join(from, entry.name);
    const d = path.join(to, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

copyDir(SRC, DEST);

// Name the package after the client.
const pkgPath = path.join(DEST, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
pkg.name = `${name.toLowerCase().replace(/[^a-z0-9-]/g, '-')}-qa`;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

// Seed a real targets.json and .env from the examples.
const targets = JSON.parse(fs.readFileSync(path.join(DEST, 'config', 'targets.example.json'), 'utf8'));
targets.name = name;
if (baseUrl) targets.baseUrl = baseUrl;
fs.writeFileSync(path.join(DEST, 'config', 'targets.json'), JSON.stringify(targets, null, 2) + '\n');

let env = fs.readFileSync(path.join(DEST, '.env.example'), 'utf8');
if (baseUrl) env = env.replace('BASE_URL=https://example.com', `BASE_URL=${baseUrl}`);
fs.writeFileSync(path.join(DEST, '.env'), env);

console.log(`Created ${DEST}`);
console.log('Next:');
console.log(`  cd ${DEST}`);
console.log('  npm install');
console.log('  edit config/targets.json and .env');
console.log('  npm run test:smoke');
