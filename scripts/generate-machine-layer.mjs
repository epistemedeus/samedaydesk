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
  const o = Object.fromEntries(record.offers.map((x) => [x.slug, x]));
  const audit = o.answer_audit, sprint = o.correction_sprint, plus = o.correction_sprint_plus;
  const line = (offer) => `- ${offer.name}: ${offer.price_label}, ${clockText(record, offer)}. ${record.site.url}${offer.path}`;
  return `# ${record.site.name}

> ${record.site.name} checks what AI answers say about a business and corrects the pages those answers rest on. Operated by ${record.site.operator}. Legal entity ${record.site.legal_name}, ${record.site.jurisdiction}.

This file is optional metadata. Everything below is also in the HTML of the pages it points at.

## Offers and prices

- ${o.free_report.name}: free, no email address required. ${record.site.url}${o.free_report.path}
${line(audit)}
${line(sprint)}
${line(plus)}

Prices are fixed and complete. There is no monthly retainer on this list, no ranking promise, and no citation promise. Delivery clocks start when the intake form is complete, not when payment succeeds.

## Start here

- [Home](${record.site.url}/): what the service is, the four prices, how it compares, and the questions owners ask.
- [Free AI Answer Report](${record.site.url}/report): enter a site, get eligibility checks on the next screen and, when the answer panel is running, quoted answers with timestamps.
- [Published self-audit](${record.site.url}/audit/samedaydesk/2026-08-19/): the same method run against this site, published while the findings were still live, with a hashed evidence pack and a replay script.
- [Methods](${record.site.url}/methods): the measurement protocol, the frozen question panel, the engines, and the defect words.
- [Terms](${record.site.url}/terms): clock rules, refund instruments, and what acceptance means.
- [For agents](${record.site.url}/for-agents): request examples and machine interfaces, as documentation.

## Free tools

There are ${toolCount} free tools, all listed on one page. No signup on any of them.

- [AI readiness checker](${record.site.url}/tools/ai-readiness)
- [All ${toolCount} free tools](${record.site.url}/tools/free-seo-ai-tools.html)

## Identity

- GitHub: ${record.site.github}
- Checker source: ${record.site.code_repo}
- Email: ${record.site.email}

Last updated: ${record.updated}
`;
}

function main() {
  const record = offers();
  const routeRecord = routes();
  const sitemapPath = path.join(root, "client/public/sitemap.xml");
  const llmsPath = path.join(root, "client/public/llms.txt");
  fs.writeFileSync(sitemapPath, renderSitemap(routeRecord));
  fs.writeFileSync(llmsPath, renderLlmsTxt(record, routeRecord));
  console.log(`[machine-layer] wrote ${routeRecord.routes.length} sitemap URLs and llms.txt from shared/offers.json v${record.version}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
