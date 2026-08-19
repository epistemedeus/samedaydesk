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
import { offers, routes, clockText, renderSitemap, renderLlmsTxt, renderHomeJsonLd, faqFromHtml, stripTags, decodeEntities, toolCountOf } from "./generate-machine-layer.mjs";

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
  const hits = raw.match(/[–—]/g);
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
  for (const offer of record.offers) {
    const label = offer.price_label;
    const hits = (home.match(new RegExp(label.replace(/[$.*+?^{}()|[\]\\]/g, "\\$&"), "g")) || []).length;
    if (offer.price > 0 && hits !== 1) fail(`price ${label} appears ${hits} times in home.html, expected exactly once`);
    if (offer.price === 0 && hits < 1) fail(`the free offer label is missing from home.html`);
  }
  const strays = [...home.matchAll(/\$[0-9][0-9,]*/g)].map((m) => m[0]);
  const allowedLabels = new Set(record.offers.map((o) => o.price_label));
  for (const s of strays) if (!allowedLabels.has(s)) fail(`home.html carries a price outside the record: ${s}`);
  // Our own prices may never be written as a range or a subscription. The comparison table
  // is allowed to describe other categories' price bands, which is what it is for.
  if (/from \$[0-9]/i.test(ownVoice(home))) fail("home.html prices something as a from-price");
  if (/\$[0-9][0-9,]*\s*(\/\s*mo\b|per month|a month|monthly)/i.test(ownVoice(home))) fail("home.html carries a monthly price for our own work");

  for (const offer of record.offers) {
    const clock = clockText(record, offer);
    if (offer.clock_key && !home.includes(clock)) fail(`home.html does not print the clock "${clock}" for ${offer.slug}`);
    if (!home.includes(offer.who)) fail(`home.html does not carry the record's "who it is for" text for ${offer.slug}`);
    if (!home.includes(offer.deliverable)) fail(`home.html does not carry the record's deliverable text for ${offer.slug}`);
  }
  if (!home.includes(record.clock_sentence)) fail("home.html does not print the clock sentence");
  if (!home.includes(record.copy.h1) && !home.includes(record.copy.h1_fallback)) fail("home.html does not carry an approved H1");
  if (!home.includes(record.copy.subhead)) fail("home.html does not carry the approved subhead");
  if (!home.includes("<!--CTA_BUTTON-->")) fail("home.html lost the CTA token, so the button cannot switch with the panel state");

  // Structured data must be exactly what the record and the visible FAQ generate.
  const expected = renderHomeJsonLd(record, home);
  const actual = home.match(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/)?.[1];
  if (!actual) fail("home.html has no JSON-LD block");
  else if (actual.trim() !== expected.trim()) fail("home.html JSON-LD is stale. Run scripts/generate-machine-layer.mjs.");
  else {
    const graph = JSON.parse(actual)["@graph"];
    const service = graph.find((n) => n["@type"] === "Service");
    for (const offer of record.offers) {
      const node = service.offers.find((o) => o.name === offer.name);
      if (!node) fail(`JSON-LD has no offer node for ${offer.name}`);
      else if (node.price !== String(offer.price / 100)) fail(`JSON-LD price for ${offer.name} is ${node.price}, record says ${offer.price / 100}`);
    }
    const org = graph.find((n) => n["@type"] === "Organization");
    if (org.legalName !== record.site.legal_name) fail("JSON-LD legalName does not match the record");
    if (org.founder?.name !== record.site.operator) fail("JSON-LD founder does not match the record");

    const faqNodes = graph.find((n) => n["@type"] === "FAQPage").mainEntity.map((q) => q.name);
    const visible = faqFromHtml(home).map((f) => f.question);
    const wanted = [...record.faq_owner, ...record.faq_vendor];
    for (const q of wanted) if (!visible.includes(q)) fail(`the homepage does not ask the research question verbatim: ${q}`);
    for (const q of faqNodes) if (!visible.includes(q)) fail(`FAQ schema asks a question the page does not: ${q}`);
    if (faqNodes.length !== visible.length) fail(`FAQ schema has ${faqNodes.length} questions, the page shows ${visible.length}`);
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
