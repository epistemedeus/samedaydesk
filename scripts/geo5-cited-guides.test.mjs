/**
 * GEO-5: the five Copilot-cited guides answer first, cite primary sources,
 * link the existing AI Visibility Audit once, and stay ASCII.
 * Seeded failures must be rejected. This file is not a customer page.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const guidesDir = join(root, "client/public/guides");

const CITED = [
  "ai-readiness-checkers-compared-2026.html",
  "why-site-not-showing-up-in-chatgpt-2026.html",
  "vet-claude-code-skills-mcp-servers.html",
  "ai-search-visibility-tools-2026.html",
  "ai-crawler-list-2026.html",
];

const GUIDE_ALLOWLIST = [
  "ai-crawler-list-2026.html",
  "ai-readiness-checkers-compared-2026.html",
  "ai-search-visibility-tools-2026.html",
  "chatgpt-vs-perplexity-vs-google-ai-readability-2026.html",
  "does-llms-txt-work-2026.html",
  "generative-engine-optimization-checklist-2026.html",
  "get-cited-by-ai-search.html",
  "how-to-add-json-ld-structured-data-for-ai-2026.html",
  "how-to-hire-ai-agents-2026.html",
  "instagram-whatsapp-dm-automation-manychat-2026.html",
  "is-your-site-ready-for-ai-shopping-agents-2026.html",
  "local-business-ai-search.html",
  "shopify-ai-search.html",
  "vet-claude-code-skills-mcp-servers.html",
  "why-site-not-showing-up-in-chatgpt-2026.html",
];

const OFFER = "https://samedaydesk.com/ai-visibility-audit.html";

const PRIMARY = [
  "https://developers.openai.com/api/docs/bots",
  "https://privacy.claude.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler",
  "https://docs.perplexity.ai/docs/resources/perplexity-crawlers",
  "https://www.perplexity.ai/help-center/en/articles/10354969-how-does-perplexity-follow-robots-txt",
  "https://developers.google.com/search/docs/appearance/ai-features",
  "https://developers.google.com/search/docs/fundamentals/ai-optimization-guide",
  "https://developers.google.com/crawling/docs/crawlers-fetchers/google-common-crawlers",
  "https://www.rfc-editor.org/rfc/rfc9309",
  "https://code.claude.com/docs/en/security",
  "https://code.claude.com/docs/en/skills",
  "https://support.claude.com/en/articles/12512180-use-skills-in-claude",
  "https://support.claude.com/en/articles/15927065-get-started-with-skill-and-plugin-scanning",
  "https://modelcontextprotocol.io/specification/2026-07-28",
  "https://docs.npmjs.com/cli/v10/using-npm/scripts",
];

const CUSTOMER_FILES = [
  "client/index.html",
  "client/public/llms.txt",
  "client/public/resources.html",
  "client/src/components/Footer.tsx",
  "client/src/pages/ForAgents.tsx",
  "client/src/pages/SellerConformance.tsx",
  "client/src/data/machineEntry.mjs",
];

const SCHEMA_IDS = [
  "neomorphic.task-memory.observation.v1",
  "neomorphic.task-memory.material-change.v1",
];

export function namesCompany(text) {
  let rest = text;
  for (const id of SCHEMA_IDS) rest = rest.split(id).join("");
  return /neomorphic/i.test(rest);
}

export function guideProblems(html) {
  const issues = [];
  for (let i = 0; i < html.length; i += 1) {
    if (html.charCodeAt(i) > 127) {
      issues.push("non-ascii");
      break;
    }
  }
  if (namesCompany(html)) issues.push("names-neomorphic");
  const offerCount = html.split(OFFER).length - 1;
  if (offerCount !== 1) issues.push(`offer-count-${offerCount}`);
  if (!html.includes("Last checked: 2026-09-23")) issues.push("missing-last-checked");
  if (!html.includes('"dateModified": "2026-09-23"') && !html.includes('"dateModified":"2026-09-23"')) {
    issues.push("missing-datemodified");
  }
  const sourced = PRIMARY.filter((url) => html.includes(url));
  if (sourced.length < 2) issues.push("few-primary-sources");
  const lead = html.match(/<h1[^>]*>[\s\S]*?<\/h1>\s*<p class="lead">([\s\S]*?)<\/p>/);
  if (!lead) issues.push("missing-answer-paragraph");
  else {
    const text = lead[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (text.length < 180) issues.push("answer-too-short");
  }
  if (/buy\.stripe\.com/.test(html)) issues.push("invented-or-extra-checkout");
  if (/\$\d/.test(html)) issues.push("price-in-guide");
  return issues;
}

export function newGuideRoutes(filenames) {
  return filenames.filter((name) => !GUIDE_ALLOWLIST.includes(name));
}

function read(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("cited guides answer first, cite sources, and link the audit once", () => {
  for (const name of CITED) {
    const html = read(`client/public/guides/${name}`);
    const issues = guideProblems(html);
    assert.deepEqual(issues, [], `${name}: ${issues.join(", ")}`);
  }
});

test("guide directory has no new pages", () => {
  const names = readdirSync(guidesDir).filter((name) => name.endsWith(".html")).sort();
  assert.deepEqual(newGuideRoutes(names), []);
  assert.deepEqual(names, [...GUIDE_ALLOWLIST].sort());
});

test("marketing customer surfaces do not name Neomorphic", () => {
  const files = [
    ...CUSTOMER_FILES,
    ...readdirSync(guidesDir).map((name) => `client/public/guides/${name}`),
  ];
  for (const rel of files) {
    const text = read(rel);
    assert.equal(namesCompany(text), false, rel);
  }
});

test("sitemap lastmod matches the check date for the five cited guides", () => {
  const xml = read("client/public/sitemap.xml");
  for (const name of CITED) {
    const block = xml.split(`<loc>https://samedaydesk.com/guides/${name}</loc>`)[1];
    assert.ok(block, name);
    assert.match(block.slice(0, 200), /<lastmod>2026-09-23<\/lastmod>/);
  }
});

test("seeded failure: a customer page that names Neomorphic LLC is rejected", () => {
  const bad = `<h1>Audit</h1>\n<p class="lead">${"A".repeat(200)}</p>\n<p>Last checked: 2026-09-23</p>\n<a href="${OFFER}">offer</a>\n<a href="https://developers.openai.com/api/docs/bots">o</a>\n<a href="https://www.rfc-editor.org/rfc/rfc9309">r</a>\n"dateModified": "2026-09-23"\nNeomorphic LLC`;
  const issues = guideProblems(bad);
  assert.ok(issues.includes("names-neomorphic"), issues.join(","));
});

test("seeded failure: a new guide route is rejected", () => {
  const extra = newGuideRoutes([...GUIDE_ALLOWLIST, "brand-new-geo-page.html"]);
  assert.deepEqual(extra, ["brand-new-geo-page.html"]);
});

test("seeded failure: an en dash and a missing offer are rejected", () => {
  const bad = `<h1>Q</h1>\n<p class="lead">${"Answer. ".repeat(40)}</p>\n<p>Last checked: 2026-09-23</p>\n"dateModified": "2026-09-23"\n<a href="https://developers.openai.com/api/docs/bots">o</a>\n<a href="https://www.rfc-editor.org/rfc/rfc9309">r</a>\nrange 1\u20133`;
  const issues = guideProblems(bad);
  assert.ok(issues.includes("non-ascii"), issues.join(","));
  assert.ok(issues.includes("offer-count-0"), issues.join(","));
});
