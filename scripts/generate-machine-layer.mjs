// Regenerates the machine layer from the versioned records in shared/.
// Writes client/public/sitemap.xml and client/public/llms.txt.
// The parity check regenerates the same strings in memory and fails the build when
// the files on disk differ, so these two surfaces cannot drift from the offer record.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(root, rel), "utf8"));

export const offers = () => readJson("shared/offers.json");
export const routes = () => readJson("shared/routes.json");

export function clockDays(record, offer) {
  if (!offer.clock_key) return null;
  return record.clocks[offer.clock_key];
}

export function clockText(record, offer) {
  const n = clockDays(record, offer);
  if (n == null) return offer.clock_text;
  return offer.clock_text.replace("{n}", String(n));
}

export function renderSitemap(routeRecord) {
  const lines = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'];
  for (const r of routeRecord.routes) {
    lines.push("  <url>");
    lines.push(`    <loc>${routeRecord.base}${r.path}</loc>`);
    lines.push(`    <lastmod>${r.lastmod}</lastmod>`);
    lines.push(`    <changefreq>${r.changefreq}</changefreq>`);
    lines.push(`    <priority>${r.priority}</priority>`);
    lines.push("  </url>");
  }
  lines.push("</urlset>");
  return lines.join("\n") + "\n";
}

// The canonical free-tool count. One number, derived from the route manifest, so the pages
// that state it cannot drift apart again (see the published self-audit, finding SDD-2026-003).
export function toolCountOf(routeRecord) {
  return routeRecord.routes.filter((r) => r.group === "tools" && !r.path.endsWith("free-seo-ai-tools.html")).length;
}

export function renderLlmsTxt(record, routeRecord) {
  const toolCount = toolCountOf(routeRecord);
  const site = record.site;
  const home = record.homepage || {};
  const h1 = home.h1 || record.copy.h1;
  const merchant = home.secondary_href || "https://agents.samedaydesk.com/";
  return `# ${site.name}

> ${site.name} is a desk for agent-era commerce. Operated by ${site.operator}. Legal entity ${site.legal_name}, ${site.jurisdiction}.

This file is optional metadata. Everything below is also in the HTML of the pages it points at.

## Start here

- [Home](${site.url}/): ${h1} No public price list on this page.
- [Inspect the rails](${merchant}): live x402 and MPP merchant.
- [Email the desk](mailto:${site.email}): ${home.primary_cta || "Bring the hard part"}.
- [For agents](${site.url}/for-agents): machine interfaces as documentation.
- [Published self-audit](${site.url}/audit/samedaydesk/2026-08-19/): frozen 2026-08-19 evidence pack, kept as historical proof, not the current homepage offer.
- [Terms](${site.url}/terms): legal terms.
- [Methods](${site.url}/methods): measurement notes for existing checkout pages, not the homepage offer.

## Free tools

There are ${toolCount} free tools, all listed on one page. No signup on any of them.

- [AI readiness checker](${site.url}/tools/ai-readiness)
- [All ${toolCount} free tools](${site.url}/tools/free-seo-ai-tools.html)

## Identity

- GitHub: ${site.github}
- Checker source: ${site.code_repo}
- Payment policy: ${site.npm}
- Email: ${site.email}

Last updated: ${record.updated}
`;
}

// ---------------------------------------------------------------------------
// JSON-LD for the homepage.
//
// The public homepage has no priced offers and no FAQ. Schema is Organization
// plus WebSite only, and those facts must also appear in visible copy.
export function faqFromHtml(html) {
  const out = [];
  const re = /<details class="faq"[^>]*>\s*<summary>([\s\S]*?)<\/summary>\s*<div class="a">([\s\S]*?)<\/div>\s*<\/details>/g;
  let m;
  while ((m = re.exec(html))) {
    out.push({ question: decodeEntities(stripTags(m[1])), answer: decodeEntities(stripTags(m[2])) });
  }
  return out;
}

export function stripTags(s) {
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export function decodeEntities(s) {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&middot;/g, "\u00b7")
    .replace(/&amp;/g, "&");
}

export function renderHomeJsonLd(record, _html) {
  const site = record.site;
  const home = record.homepage || {};
  const graph = [
    {
      "@type": "Organization",
      "@id": `${site.url}/#org`,
      name: site.name,
      legalName: site.legal_name,
      url: `${site.url}/`,
      email: site.email,
      founder: { "@type": "Person", name: site.operator },
      address: { "@type": "PostalAddress", addressLocality: "Sheridan", addressRegion: "WY", addressCountry: "US" },
      sameAs: [site.github, site.npm],
    },
    {
      "@type": "WebSite",
      "@id": `${site.url}/#site`,
      url: `${site.url}/`,
      name: site.name,
      description: home.subhead || record.copy.subhead,
      publisher: { "@id": `${site.url}/#org` },
    },
  ];
  return JSON.stringify({ "@context": "https://schema.org", "@graph": graph }, null, 2);
}

export function injectJsonLd(html, jsonld) {
  const block = `<!-- JSONLD:START -->\n<script type="application/ld+json">\n${jsonld}\n</script>\n<!-- JSONLD:END -->`;
  return html.replace(/<!-- JSONLD:START -->[\s\S]*?<!-- JSONLD:END -->/, block);
}

function main() {
  const record = offers();
  const routeRecord = routes();
  const sitemapPath = path.join(root, "client/public/sitemap.xml");
  const llmsPath = path.join(root, "client/public/llms.txt");
  fs.writeFileSync(sitemapPath, renderSitemap(routeRecord));
  fs.writeFileSync(llmsPath, renderLlmsTxt(record, routeRecord));

  const homePath = path.join(root, "client/public/home.html");
  if (fs.existsSync(homePath)) {
    const html = fs.readFileSync(homePath, "utf8");
    fs.writeFileSync(homePath, injectJsonLd(html, renderHomeJsonLd(record, html)));
  }
  console.log(`[machine-layer] wrote ${routeRecord.routes.length} sitemap URLs and llms.txt from shared/offers.json v${record.version}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
