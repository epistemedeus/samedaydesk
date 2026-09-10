#!/usr/bin/env node
/**
 * Heavy consumer path for a concrete public-page brief:
 * 1) select published preflight/catalog skill guidance (credential-free)
 * 2) unpaid GET /extract with agent-skills attribution
 * 3) stop honestly on HTTP 402 (no wallet / no pay / no retry)
 * 4) compare a direct HTTPS GET brief for the same URL
 *
 * Distinguishes: skill installation ≠ model selection ≠ free execution ≠ payment.
 */
import fs from "node:fs";

const ORIGIN = process.env.SAMEDAYDESK_ORIGIN || "https://agents.samedaydesk.com";
const TARGET = process.env.S77_TARGET_URL || "https://example.com/";
const OUT = process.env.S77_OUT || "/tmp/s77-heavy-consumer.json";

function briefFromHtml(html, finalUrl, status) {
  const title = (html.match(/<title[^>]*>([^<]*)<\/title>/i) || [, null])[1];
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 280);
  return {
    mode: "direct_fetch_brief",
    status,
    finalUrl,
    title,
    text_excerpt: text,
    limits: "no SSRF guardrails, no payment, no structured capture fields, HTML only",
  };
}

const selected = {
  skill_installation: "epistemedeus/x402-data-gateway-skills@web-extract (or live well-known web-extract)",
  model_selection: "orthogonal; not implied by skill install",
  catalog_preflight_skill: "samedaydesk-machine-commerce",
  paid_skill: "web-extract",
  free_execution: "unpaid challenge + direct fetch brief only",
  payment: "not authorized in this consumer",
};

const extractUrl = `${ORIGIN}/extract?url=${encodeURIComponent(TARGET)}`;
const extractRes = await fetch(extractUrl, {
  headers: { "X-SameDayDesk-Agent-Source": "agent-skills-v1", Accept: "application/json" },
  redirect: "manual",
});
const extractBodyText = await extractRes.text();
let extractBody = null;
try { extractBody = JSON.parse(extractBodyText); } catch { extractBody = { raw: extractBodyText.slice(0, 500) }; }

const unpaid = {
  request: { method: "GET", url: extractUrl },
  http_status: extractRes.status,
  payment_required_header: extractRes.headers.get("payment-required") ? "present" : null,
  www_authenticate: extractRes.headers.get("www-authenticate") ? "present" : null,
  body_keys: extractBody && typeof extractBody === "object" ? Object.keys(extractBody).slice(0, 20) : [],
  interpretation:
    extractRes.status === 402
      ? "honest_unpaid_402_no_execution"
      : extractRes.status === 200
        ? "unexpected_paid_or_free_success_investigate"
        : `unexpected_status_${extractRes.status}`,
  payment_attempted: false,
  wallet_touched: false,
};

const directRes = await fetch(TARGET, { redirect: "follow" });
const directHtml = await directRes.text();
const direct = briefFromHtml(directHtml, directRes.url, directRes.status);

const comparison = {
  same_target: TARGET,
  paid_path: "selected web-extract /extract; stopped at unpaid 402 without execution",
  direct_path: "plain HTTPS GET produced a weak HTML title/excerpt brief",
  invented_token_or_time_win: false,
  useful_bounded_output:
    unpaid.interpretation === "honest_unpaid_402_no_execution"
      ? "recognized unpaid 402; direct brief only"
      : "see statuses",
};

const report = {
  selected,
  unpaid_extract_preflight: unpaid,
  direct_fetch_brief: direct,
  comparison,
  observed_at_utc: new Date().toISOString(),
};
fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (unpaid.interpretation !== "honest_unpaid_402_no_execution") process.exitCode = 2;
