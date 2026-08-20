#!/usr/bin/env node
// End to end verification against a running site. Used twice: locally in production mode
// with zero environment keys, and against the live host after each deploy.
//
//   node scripts/smoke.mjs http://127.0.0.1:3000
//   node scripts/smoke.mjs https://samedaydesk.com
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const base = (process.argv[2] || "http://127.0.0.1:3000").replace(/\/$/, "");
const record = JSON.parse(fs.readFileSync(path.join(root, "shared/offers.json"), "utf8"));
const routeRecord = JSON.parse(fs.readFileSync(path.join(root, "shared/routes.json"), "utf8"));

const results = [];
const pass = (name, detail = "") => results.push({ ok: true, name, detail });
const fail = (name, detail = "") => results.push({ ok: false, name, detail });

const UA_CRAWLER = "OAI-SearchBot/1.4";
const UA_BROWSER = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

async function get(pathname, { ua = UA_BROWSER, redirect = "manual" } = {}) {
  const res = await fetch(`${base}${pathname}`, { headers: { "User-Agent": ua }, redirect });
  const text = res.status < 400 || res.status === 404 ? await res.text() : "";
  return { status: res.status, location: res.headers.get("location"), text, headers: res.headers };
}

async function main() {
  // 1. Health
  const health = await get("/api/health");
  health.status === 200 ? pass("health endpoint", "200") : fail("health endpoint", `status ${health.status}`);

  // 2. Offer facts in first HTML, to a crawler user agent
  const home = await get("/", { ua: UA_CRAWLER });
  if (home.status !== 200) fail("homepage", `status ${home.status}`);
  else {
    const h1 = home.text.match(/<h1>([\s\S]*?)<\/h1>/)?.[1]?.trim();
    h1 === record.copy.h1 || h1 === record.copy.h1_fallback
      ? pass("homepage H1 in first HTML", h1)
      : fail("homepage H1 in first HTML", `got ${h1}`);
    for (const offer of record.offers.filter((o) => o.price > 0)) {
      const hits = (home.text.match(new RegExp(offer.price_label.replace(/[$.*+?^{}()|[\]\\]/g, "\\$&"), "g")) || []).length;
      hits === 1 ? pass(`price ${offer.price_label} once in first HTML`) : fail(`price ${offer.price_label} in first HTML`, `${hits} occurrences`);
    }
    /<table>/.test(home.text) ? pass("comparison and price tables are real HTML") : fail("tables missing from first HTML");
    (home.text.match(/<summary>/g) || []).length >= 18
      ? pass("FAQ answers in first HTML", `${(home.text.match(/<summary>/g) || []).length} questions`)
      : fail("FAQ answers in first HTML");
    home.text.includes(record.clock_sentence) ? pass("clock sentence on the homepage") : fail("clock sentence missing from the homepage");
    home.text.includes("application/ld+json") ? pass("structured data present") : fail("structured data missing");
  }

  // 3. Crawler and browser get the same document
  const homePlain = await get("/", { ua: UA_BROWSER });
  homePlain.text === home.text ? pass("crawler and browser parity", "identical bytes") : fail("crawler and browser parity", "bodies differ");

  // 4. Pay cards, visible to curl
  for (const offer of record.offers.filter((o) => o.price > 0)) {
    const card = await get(offer.path);
    if (card.status !== 200) {
      fail(`pay card ${offer.path}`, `status ${card.status}`);
      continue;
    }
    const missing = [];
    if (!card.text.includes(offer.price_label)) missing.push("price");
    if (!card.text.includes(record.clock_sentence)) missing.push("clock sentence");
    if (!card.text.includes(offer.exclusion)) missing.push("exclusion line");
    const clock = offer.clock_text.replace("{n}", String(record.clocks[offer.clock_key]));
    if (!card.text.includes(clock)) missing.push("clock");
    missing.length ? fail(`pay card ${offer.path}`, `missing ${missing.join(", ")}`) : pass(`pay card ${offer.path}`, "price, clock, exclusion all visible");
  }

  // 5. The report and its two honest CTA variants
  const report = await get("/report");
  if (report.status !== 200) fail("/report", `status ${report.status}`);
  else {
    const onCopy = report.text.includes(record.copy.cta_panel_on);
    const offCopy = report.text.includes(record.copy.cta_panel_off);
    onCopy !== offCopy
      ? pass("report CTA matches the deployment", onCopy ? "panel on" : "panel off")
      : fail("report CTA", "neither or both variants present");
  }

  // 6. Every crawlable URL answers
  let bad = [];
  for (const r of routeRecord.routes) {
    const res = await get(r.path);
    if (res.status !== 200) bad.push(`${r.path} ${res.status}`);
  }
  bad.length ? fail("every sitemap URL answers 200", bad.join(", ")) : pass("every sitemap URL answers 200", `${routeRecord.routes.length} URLs`);

  // 7. Retired URLs and real 404s
  for (const [from, to] of Object.entries(routeRecord.redirects || {})) {
    const res = await get(from);
    res.status === 301 && new URL(res.location, base).pathname === to
      ? pass(`retired ${from}`, `301 to ${to}`)
      : fail(`retired ${from}`, `status ${res.status} to ${res.location}`);
  }
  const missing = await get("/this-page-does-not-exist-9f3a");
  missing.status === 404 ? pass("unknown URL returns 404") : fail("unknown URL returns 404", `status ${missing.status}`);

  // 8. Machine layer is live and truthful
  const llms = await get("/llms.txt");
  const sitemap = await get("/sitemap.xml");
  const robots = await get("/robots.txt");
  llms.status === 200 && record.offers.every((o) => llms.text.includes(o.name))
    ? pass("llms.txt lists the four offers")
    : fail("llms.txt", `status ${llms.status}`);
  sitemap.status === 200 && ["/report", "/pay/audit", "/methods", "/terms", "/for-agents"].every((p) => sitemap.text.includes(`<loc>${routeRecord.base}${p}</loc>`))
    ? pass("sitemap carries the money pages")
    : fail("sitemap", `status ${sitemap.status}`);
  robots.status === 200 && ["Claude-SearchBot", "Claude-User", "OAI-SearchBot", "PerplexityBot"].every((t) => robots.text.includes(t))
    ? pass("robots allows the retrieval fetchers")
    : fail("robots", `status ${robots.status}`);

  // 9. The self-audit is intact
  const audit = await get("/audit/samedaydesk/2026-08-19/");
  const ids = ["SDD-2026-001", "SDD-2026-002", "SDD-2026-003", "SDD-2026-004"];
  audit.status === 200 && ids.every((id) => audit.text.includes(id)) && !/noindex/.test(audit.text)
    ? pass("self-audit live, indexable, all High findings present")
    : fail("self-audit", `status ${audit.status}`);
  const replay = await get("/audit/samedaydesk/2026-08-19/replay.sh");
  replay.status === 200 && replay.text.includes("SDD-2026-001") ? pass("replay script downloadable") : fail("replay script", `status ${replay.status}`);

  // 10. Report
  const failed = results.filter((r) => !r.ok);
  for (const r of results) console.log(`${r.ok ? "pass" : "FAIL"}  ${r.name}${r.detail ? `  (${r.detail})` : ""}`);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed against ${base}`);
  if (failed.length) process.exit(1);
}

main().catch((e) => {
  console.error(`smoke run failed: ${e.message}`);
  process.exit(2);
});
