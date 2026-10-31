#!/usr/bin/env node
/**
 * Builds config/targets.json from a site's sitemap.
 *   node scripts/discover.mjs <baseUrl> [perGroup] [ProjectName]
 *
 * URLs are bucketed by route shape (/post/*, /channel/*, top-level, ...) and
 * sampled per bucket, so the suite covers every template type without running
 * against thousands of pages.
 */
import fs from 'node:fs';
import path from 'node:path';

const [baseUrl, perGroupArg, nameArg] = process.argv.slice(2);
if (!baseUrl) {
  console.error('Usage: node scripts/discover.mjs <baseUrl> [perGroup] [ProjectName]');
  process.exit(1);
}
const PER_GROUP = Number(perGroupArg ?? 3);
const origin = new URL(baseUrl).origin;

const get = async (url) => {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.text();
};

const tag = (xml, name) => {
  const re = new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'gi');
  const out = [];
  let m;
  while ((m = re.exec(xml)) !== null) out.push(m[1].trim());
  return out;
};

const decode = (s) =>
  s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");

// Resolve the sitemap location from robots.txt when possible.
let sitemapUrl = `${origin}/sitemap.xml`;
try {
  const robots = await get(`${origin}/robots.txt`);
  const declared = /^\s*sitemap:\s*(\S+)/im.exec(robots)?.[1];
  if (declared) sitemapUrl = declared.trim();
} catch {
  /* no robots.txt - fall back to the conventional location */
}

console.log(`Sitemap: ${sitemapUrl}`);
const rootXml = await get(sitemapUrl);

/** Route shape fallback: /post/abc -> "post", /about -> "root", / -> "home" */
function shapeOf(pathname) {
  const parts = pathname.split('/').filter(Boolean);
  if (parts.length === 0) return 'home';
  if (parts.length === 1) return 'root';
  return parts[0];
}

// url -> group. A sitemap index already separates content types far better
// than route shape can (a creator profile and an About page are both /x),
// so prefer the section name and fall back to shape for a flat sitemap.
const grouped = new Map();
const add = (url, group) => {
  if (!url.startsWith(origin)) return;
  if (grouped.has(url)) return;
  grouped.set(url, group);
};

if (/<sitemapindex/i.test(rootXml)) {
  const sections = tag(rootXml, 'sitemap').map((b) => decode(tag(b, 'loc')[0] ?? '')).filter(Boolean);
  console.log(`Sitemap index with ${sections.length} section(s)`);
  for (const section of sections) {
    const label = new URL(section).pathname.split('/').filter(Boolean).pop() ?? 'section';
    try {
      const xml = await get(section);
      const found = tag(xml, 'url').map((b) => decode(tag(b, 'loc')[0] ?? '')).filter(Boolean);
      console.log(`  ${section} -> ${found.length}`);
      for (const u of found) add(u, label);
    } catch (e) {
      console.warn(`  ${section} -> FAILED: ${e.message}`);
    }
  }
} else {
  for (const u of tag(rootXml, 'url').map((b) => decode(tag(b, 'loc')[0] ?? '')).filter(Boolean)) {
    add(u, shapeOf(new URL(u).pathname));
  }
}

console.log(`\nTotal unique URLs: ${grouped.size}`);

const buckets = new Map();
for (const [url, group] of grouped) {
  const { pathname } = new URL(url);
  const list = buckets.get(group) ?? [];
  list.push(pathname);
  buckets.set(group, list);
}

const pages = [];
for (const [group, paths] of [...buckets.entries()].sort()) {
  // "static" pages are each a distinct template and all worth covering;
  // the generated content types are sampled.
  const take = group === 'static' || group === 'home' || group === 'root' ? paths.length : PER_GROUP;
  for (const p of paths.slice(0, take)) {
    const name =
      p === '/'
        ? 'Home'
        : decodeURIComponent(p)
            .split('/')
            .filter(Boolean)
            .join(' / ')
            .slice(0, 60);
    pages.push({ path: p, name, group });
  }
  console.log(`  group "${group}": ${paths.length} found, ${Math.min(take, paths.length)} selected`);
}

const cfgPath = path.join('config', 'targets.json');
const base = fs.existsSync(cfgPath)
  ? JSON.parse(fs.readFileSync(cfgPath, 'utf8'))
  : JSON.parse(fs.readFileSync(path.join('config', 'targets.example.json'), 'utf8'));

base.name = nameArg ?? base.name;
base.baseUrl = origin;
base.sitemapUrl = sitemapUrl;
base.pages = pages;

fs.mkdirSync('config', { recursive: true });
fs.writeFileSync(cfgPath, JSON.stringify(base, null, 2) + '\n');
console.log(`\nWrote ${cfgPath} with ${pages.length} page(s) across ${buckets.size} group(s)`);
