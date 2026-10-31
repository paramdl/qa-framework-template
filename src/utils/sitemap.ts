import type { APIRequestContext } from '@playwright/test';

export interface SitemapEntry { loc: string; lastmod?: string; source: string }

function extract(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'gi');
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) out.push(m[1].trim());
  return out;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

/**
 * Walks a sitemap index one level deep and returns every URL it declares.
 * One level is deliberate - nested indexes beyond that are a spec violation
 * worth reporting rather than silently following.
 */
export async function collectSitemapUrls(
  ctx: APIRequestContext,
  sitemapUrl: string,
): Promise<{ entries: SitemapEntry[]; sections: string[]; errors: string[] }> {
  const errors: string[] = [];
  const entries: SitemapEntry[] = [];
  const sections: string[] = [];

  const root = await ctx.get(sitemapUrl, { failOnStatusCode: false });
  if (!root.ok()) {
    return { entries, sections, errors: [`Sitemap ${sitemapUrl} returned HTTP ${root.status()}`] };
  }
  const rootXml = await root.text();

  const isIndex = /<sitemapindex/i.test(rootXml);
  if (!isIndex) {
    for (const block of extract(rootXml, 'url')) {
      const loc = decodeEntities(extract(block, 'loc')[0] ?? '');
      if (loc) entries.push({ loc, lastmod: extract(block, 'lastmod')[0], source: sitemapUrl });
    }
    return { entries, sections: [sitemapUrl], errors };
  }

  for (const block of extract(rootXml, 'sitemap')) {
    const loc = decodeEntities(extract(block, 'loc')[0] ?? '');
    if (!loc) continue;
    sections.push(loc);

    const res = await ctx.get(loc, { failOnStatusCode: false });
    if (!res.ok()) {
      errors.push(`Sitemap section ${loc} returned HTTP ${res.status()}`);
      continue;
    }
    const xml = await res.text();
    for (const urlBlock of extract(xml, 'url')) {
      const u = decodeEntities(extract(urlBlock, 'loc')[0] ?? '');
      if (u) entries.push({ loc: u, lastmod: extract(urlBlock, 'lastmod')[0], source: loc });
    }
  }

  return { entries, sections, errors };
}
