#!/usr/bin/env node
// Parity gate. Runs inside `npm run build`, so a drifted site cannot be published.
//
// It compares every published surface against shared/offers.json and shared/routes.json:
// the visible price table, the pay cards, the structured data, llms.txt, the sitemap, the
// client mirror of the offer list, and the house copy rules. Any mismatch exits non-zero.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { offers, routes, clockText, renderSitemap, renderLlmsTxt, renderHomeJsonLd, stripTags, decodeEntities, toolCountOf } from "./generate-machine-layer.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const notes = [];
const fail = (msg) => failures.push(msg);
const read = (rel) => (fs.existsSync(path.join(root, rel)) ? fs.readFileSync(path.join(root, rel), "utf8") : null);
const exists = (rel) => fs.existsSync(path.join(root, rel));

const record = offers();
const routeRecord = routes();

// Text a human wrote in our own voice: quoted evidence and code samples are exempt, so an
// audit can quote a banned sentence back at us without failing its own build.
function ownVoice(html) {
  let t = html.replace(/<script[\s\S]*?<\/script>/gi, " ");
  t = t.replace(/<style[\s\S]*?<\/style>/gi, " ");
  t = t.replace(/<(pre|code|blockquote)[^>]*>[\s\S]*?<\/\1>/gi, " ");
  return decodeEntities(stripTags(t));
}

// ---------------------------------------------------------------- house copy rules
const BANNED_PHRASES = [
  "what AI is telling",
  "what AI is saying",
  "what AI is recommending",
  "or a competitor",
  "Run the free report",
  "unsolicited",
  "live callable machine interfaces",
  "exactly",
  "every day",
  "whatever they last read",
  "answer engine",
  "share of voice",
  "AI visibility",
  "we will get you cited",
  "guaranteed citation",
  "guarantee a citation",
  "guarantee you a ranking",
  "get you ranked",
];
const BANNED_WORDS = ["GEO", "AEO"];

// Surfaces this build is responsible for. Legacy content directories keep their own
// history and are listed in the contract as untouched.
const SCANNED_SURFACES = [
  "client/index.html",
  "client/public/home.html",
  "client/public/terms.html",
  "client/public/methods.html",
  "client/public/for-agents.html",
  "client/public/404.html",
  "client/public/resources.html",
  "client/public/pay/audit.html",
  "client/public/pay/sprint.html",
  "client/public/pay/sprint-plus.html",
  "client/public/llms.txt",
  "client/public/robots.txt",
  "client/public/sitemap.xml",
  "client/public/site.webmanifest",
  "client/public/.well-known/agent-card.json",
  "client/public/audit/samedaydesk/2026-08-19/index.html",
];

for (const rel of SCANNED_SURFACES) {
  const raw = read(rel);
  if (raw == null) continue;
  const text = rel.endsWith(".html") ? ownVoice(raw) : raw;
  for (const phrase of BANNED_PHRASES) {
    if (new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(text)) fail(`banned phrase "${phrase}" in ${rel}`);
  }
  for (const word of BANNED_WORDS) {
    if (new RegExp(`\\b${word}\\b`).test(text)) fail(`banned term "${word}" in ${rel}`);
  }
}

// ---------------------------------------------------------------- no em or en dashes
// Scanned: everything this build owns. Excluded: the legacy content the contract says to
// leave alone, and the frozen audit evidence, which is a byte-for-byte capture.
const DASH_EXCLUDE = [
  /^client\/public\/(tools|guides|reports|docs|docs-lab|data-lab|go|kit|research)\//,
  /^client\/public\/skillguard\.html$/,
  /^client\/public\/audit\/samedaydesk\/2026-08-19\/evidence\//,
  /^client\/brand\//,
  /^research\//,
  /^web-guides\//,
  /^server\/routes\/mcp\.js$/,
  /^server\/scripts\//,
  /^supabase\/migrations\/0001_init\.sql$/,
  /^(PLAN|UPDATE-PLAN-post-playbook|DNS-RECORDS|TASKMARKET-INTEGRATION)\.md$/,
  /^package-lock\.json$/,
  /^client\/package-lock\.json$/,
];
const TEXT_EXT = /\.(js|mjs|ts|tsx|json|html|css|md|txt|xml|sql|yml|yaml|webmanifest|sh)$/;

let tracked = [];
try {
  tracked = execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" }).split("\n").filter(Boolean);
} catch {
  notes.push("git ls-files unavailable, dash scan limited to the known surfaces");
  tracked = SCANNED_SURFACES;
}
for (const rel of tracked) {
  if (!TEXT_EXT.test(rel)) continue;
  if (DASH_EXCLUDE.some((re) => re.test(rel))) continue;
  const raw = read(rel);
  if (raw == null) continue;
  const hits = raw.match(/[\u2013\u2014]/g);
  if (hits) fail(`${hits.length} em or en dash character(s) in ${rel}`);
}

// ---------------------------------------------------------------- generated files are current
const sitemapOnDisk = read("client/public/sitemap.xml");
if (sitemapOnDisk !== renderSitemap(routeRecord)) fail("client/public/sitemap.xml is not what the route manifest generates. Run scripts/generate-machine-layer.mjs.");
const llmsOnDisk = read("client/public/llms.txt");
if (llmsOnDisk !== renderLlmsTxt(record, routeRecord)) fail("client/public/llms.txt is not what the offer record generates. Run scripts/generate-machine-layer.mjs.");

// Sitemap content rules: the money pages are in, the killed URLs are out.
for (const money of ["/", "/report", "/pay/audit", "/pay/sprint", "/pay/sprint-plus", "/methods", "/terms", "/for-agents", "/audit/samedaydesk/2026-08-19/"]) {
  if (!sitemapOnDisk?.includes(`<loc>${routeRecord.base}${money}</loc>`)) fail(`sitemap is missing the money page ${money}`);
}
for (const dead of [...Object.keys(routeRecord.redirects || {}), ...(routeRecord.not_in_sitemap || [])]) {
  if (sitemapOnDisk?.includes(`<loc>${routeRecord.base}${dead}</loc>`)) fail(`sitemap still lists the retired URL ${dead}`);
}

// The tool count is one number, derived once. Every page that states it must agree.
const toolCount = toolCountOf(routeRecord);
const resources = read("client/public/resources.html");
if (resources && !resources.includes(`Free tools (${toolCount})`)) fail(`resources.html does not publish the canonical free tool count of ${toolCount}`);
if (llmsOnDisk && !llmsOnDisk.includes(`There are ${toolCount} free tools`)) fail(`llms.txt does not publish the canonical free tool count of ${toolCount}`);

// ---------------------------------------------------------------- client mirror
const clientCatalog = read("client/src/lib/services.ts");
if (clientCatalog) {
  for (const offer of record.offers) {
    if (!clientCatalog.includes(`slug: "${offer.slug}"`)) fail(`client catalog is missing ${offer.slug}`);
    if (!clientCatalog.includes(`price: ${offer.price}`)) fail(`client catalog price for ${offer.slug} does not match the record`);
    if (!clientCatalog.includes(`priceLabel: "${offer.price_label}"`)) fail(`client catalog price label for ${offer.slug} does not match the record`);
  }
  const strayPrices = [...clientCatalog.matchAll(/price:\s*(\d+)/g)].map((m) => Number(m[1]));
  const allowed = new Set(record.offers.map((o) => o.price));
  for (const p of strayPrices) if (!allowed.has(p)) fail(`client catalog carries a price that is not in the record: ${p}`);
}

// ---------------------------------------------------------------- homepage
// The audit-only commit predates the homepage, so these assertions activate with the file.
const home = read("client/public/home.html");
if (!home) {
  notes.push("client/public/home.html not present: homepage assertions skipped");
} else {
  const page = record.homepage || {};
  const visibleHome = ownVoice(home);
  const required = [
    page.eyebrow,
    page.h1 || record.copy.h1,
    page.subhead || record.copy.subhead,
    page.primary_cta,
    page.primary_href,
    page.secondary_cta,
    page.secondary_href,
    page.trust,
    page.policy,
    page.proof_h2,
    page.how_h2,
    page.hero_ticket?.stamp,
    page.hero_ticket?.figure,
    page.hero_ticket?.rail,
    page.hero_ticket?.asset,
    page.hero_ticket?.href,
    page.hero_ticket?.footnote,
  ].filter(Boolean);
  for (const snippet of required) {
    if (!home.includes(snippet)) fail(`home.html is missing binding copy: ${snippet}`);
  }
  if (!home.includes(`<h1>${page.h1 || record.copy.h1}</h1>`)) fail("home.html does not carry the approved H1 element");
  if (!home.includes('id="main"')) fail("home.html lost main landmark id");
  if (!home.includes("Skip to content")) fail("home.html lost the skip link");
  if (/<div id="root"/.test(home)) fail("home.html contains an empty app shell");
  if (home.includes("<!--CTA_BUTTON-->")) fail("home.html still has the report CTA token");
  if (/<form[\s\S]*action="\/report"/.test(home)) fail("home.html still posts the report form");
  if (/<details class="faq"/.test(home)) fail("home.html still carries a homepage FAQ");
  if (/<table>/i.test(home)) fail("home.html still carries a table");

  const homepagePrices = ["$250", "$29", "$49", "$490", "$2,400", "$4,800", "$99", "$189", "$199", "$299", "$399", "$59"];
  for (const price of homepagePrices) {
    if (home.includes(price) || visibleHome.includes(price)) fail(`human price ${price} on /`);
  }
  if (/\$[0-9]/.test(home)) fail("home.html carries a human dollar price");
  if (/from \$[0-9]/i.test(visibleHome)) fail("home.html prices something as a from-price");
  if (/\$[0-9][0-9,]*\s*(\/\s*mo\b|per month|a month|monthly)/i.test(visibleHome)) fail("home.html carries a monthly price for our own work");

  const homepageBans = [
    "What we do not do",
    "How it compares",
    "Is this a real company",
    "Has anyone actually used you",
    "ChatGPT still quotes a price you changed two years ago.",
    "AI is still selling a service you retired last year.",
    "Buy the audit",
    "Buy the sprint",
    "AggregateRating",
    "OfferCatalog",
    "registered legal entity",
    "Most popular",
    "23 paid actions",
    "independent use",
    "independent buyer",
    "independent buyers",
    "banked revenue",
  ];
  for (const phrase of homepageBans) {
    if (visibleHome.toLowerCase().includes(phrase.toLowerCase()) || home.includes(phrase)) {
      fail(`banned homepage phrase "${phrase}" in home.html`);
    }
  }
  for (const row of page.proof || []) {
    if (!home.includes(row.stamp)) fail(`home.html is missing proof stamp ${row.stamp}`);
    if (!home.includes(row.title)) fail(`home.html is missing proof title ${row.title}`);
    if (!home.includes(row.figure)) fail(`home.html is missing proof figure ${row.figure}`);
    if (!home.includes(row.href)) fail(`home.html is missing proof href ${row.href}`);
  }
  if ((page.proof || []).length > 3) fail("homepage proof record has more than three rows");
  if (page.hero_ticket?.figure !== "22 paid actions") fail("homepage ticket figure must be 22 paid actions");
  if (page.proof?.[0]?.figure !== "22 paid actions") fail("homepage proof figure must be 22 paid actions");
  if (!page.hero_ticket?.footnote?.includes("Circle Gateway")) fail("homepage footnote must distinguish Circle Gateway from a 23rd product");
  if (home.includes("23 paid actions") || visibleHome.includes("23 paid actions")) fail("home.html still claims 23 paid actions");

  const agents = read("client/public/for-agents.html");
  if (agents) {
    const visibleAgents = ownVoice(agents);
    if (agents.includes("x402-url-extractor-production.up.railway.app")) fail("for-agents.html still uses the Railway hostname as the merchant origin");
    if (/human services and their prices are on the/i.test(agents) || /human services and their prices are on the/i.test(visibleAgents)) {
      fail("for-agents.html still says human prices are on the homepage");
    }
    if (/four offers with prices/i.test(agents)) fail("for-agents.html still says llms.txt carries four priced offers");
    if (!agents.includes("The homepage has no public price list.")) fail("for-agents.html must say the homepage has no public price list");
    if (!agents.includes("https://agents.samedaydesk.com/")) fail("for-agents.html must point at the canonical merchant origin");
    if (!agents.includes("22 paid actions on x402 and MPP")) fail("for-agents.html must count 22 dual-rail paid actions");
    if (!agents.includes("samedaydesk-agent-tools")) fail("for-agents.html must name the homepage MCP as samedaydesk-agent-tools");
  }

  const agentCard = read("client/public/.well-known/agent-card.json");
  if (agentCard) {
    if (/checks what AI answers/i.test(agentCard)) fail("agent-card.json still describes the old GEO thesis");
    if (!agentCard.includes("https://agents.samedaydesk.com/")) fail("agent-card.json must point at the live merchant origin");
  }
  const manifest = read("client/public/site.webmanifest");
  if (manifest && /checks what AI answers/i.test(manifest)) fail("site.webmanifest still describes the old GEO thesis");
  for (const step of page.how || []) {
    if (!home.includes(step.title)) fail(`home.html is missing how title ${step.title}`);
    if (!home.includes(step.body)) fail(`home.html is missing how body ${step.body}`);
  }

  const expected = renderHomeJsonLd(record, home);
  const actual = home.match(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/)?.[1];
  if (!actual) fail("home.html has no JSON-LD block");
  else if (actual.trim() !== expected.trim()) fail("home.html JSON-LD is stale. Run scripts/generate-machine-layer.mjs.");
  else {
    const graph = JSON.parse(actual)["@graph"];
    const types = graph.map((n) => n["@type"]);
    if (types.includes("FAQPage")) fail("homepage JSON-LD still has FAQPage");
    if (types.includes("Service")) fail("homepage JSON-LD still has Service");
    if (types.includes("Offer")) fail("homepage JSON-LD still has Offer");
    if (types.includes("OfferCatalog")) fail("homepage JSON-LD still has OfferCatalog");
    if (types.includes("AggregateRating")) fail("homepage JSON-LD still has AggregateRating");
    if (!types.includes("Organization") || !types.includes("WebSite")) fail("homepage JSON-LD must contain Organization and WebSite");
    if (types.length !== 2) fail(`homepage JSON-LD has unexpected nodes: ${types.join(", ")}`);
    const org = graph.find((n) => n["@type"] === "Organization");
    if (org.legalName !== record.site.legal_name) fail("JSON-LD legalName does not match the record");
    if (org.founder?.name !== record.site.operator) fail("JSON-LD founder does not match the record");
    const siteNode = graph.find((n) => n["@type"] === "WebSite");
    if (siteNode.description && siteNode.description !== (page.subhead || record.copy.subhead)) {
      fail("JSON-LD WebSite description does not match visible homepage subhead");
    }
  }
}

// ---------------------------------------------------------------- pay cards
for (const offer of record.offers.filter((o) => o.price > 0)) {
  const rel = `client/public${offer.path}.html`;
  const card = read(rel);
  if (!card) {
    fail(`missing pay card ${rel}`);
    continue;
  }
  const visible = ownVoice(card);
  if (!visible.includes(offer.price_label)) fail(`${rel} does not show the price ${offer.price_label}`);
  if (!visible.includes(clockText(record, offer))) fail(`${rel} does not show the clock "${clockText(record, offer)}"`);
  if (!visible.includes(record.clock_sentence)) fail(`${rel} does not print the clock sentence`);
  if (!visible.includes(offer.exclusion)) fail(`${rel} does not print its exclusion line verbatim`);
  if (!card.includes(`name="offer" value="${offer.slug}"`)) fail(`${rel} does not post the slug ${offer.slug}`);
  if (offer.slug === "answer_audit") {
    for (const cls of record.refund_instruments.A.classes) {
      if (!visible.includes(cls)) fail(`${rel} does not print refund class: ${cls.slice(0, 40)}`);
    }
  }
}

// ---------------------------------------------------------------- terms page
const terms = read("client/public/terms.html");
if (!terms) fail("missing client/public/terms.html");
else {
  const visible = ownVoice(terms);
  for (const cls of record.refund_instruments.A.classes) if (!visible.includes(cls)) fail(`terms is missing refund class: ${cls.slice(0, 40)}`);
  for (const never of record.refund_instruments.C.never) if (!visible.includes(never)) fail(`terms is missing the never-fires class: ${never}`);
  if (!visible.includes(record.clock_sentence)) fail("terms does not print the clock sentence");
  for (const offer of record.offers.filter((o) => o.clock_key)) {
    if (!visible.includes(String(record.clocks[offer.clock_key]))) fail(`terms does not carry the ${offer.slug} clock value`);
  }
}

// ---------------------------------------------------------------- built output
if (exists("client/dist")) {
  for (const rel of ["home.html", "terms.html", "methods.html", "for-agents.html", "pay/audit.html", "pay/sprint.html", "pay/sprint-plus.html", "llms.txt", "sitemap.xml", "site.css", "audit/samedaydesk/2026-08-19/index.html"]) {
    if (!exists(`client/dist/${rel}`)) fail(`build output is missing ${rel}`);
  }
  const builtHome = read("client/dist/home.html");
  if (builtHome && home && builtHome !== home) fail("client/dist/home.html differs from the source document");
  const shell = read("client/dist/index.html");
  if (shell) {
    if (/OfferCatalog/.test(shell)) fail("the app shell still carries an offer catalog in its structured data");
    if (/<noscript>/.test(shell)) fail("the app shell still carries a noscript catalog block");
    if (/busywork/i.test(shell)) fail("the app shell still carries the retired tagline");
  }
} else {
  notes.push("client/dist not present: build-output assertions skipped");
}

// ---------------------------------------------------------------- report
console.log(`[parity] offer record v${record.version}, ${record.offers.length} offers, ${routeRecord.routes.length} routes, ${toolCount} free tools`);
for (const n of notes) console.log(`[parity] note: ${n}`);
if (failures.length) {
  console.error(`\n[parity] ${failures.length} problem(s):`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("[parity] every published surface matches the record");
