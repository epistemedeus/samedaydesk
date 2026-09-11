import assert from "node:assert/strict";
import test from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderHtml } from "../src/html.mjs";
import { adapters, buildReport, ingestAll } from "../src/index.mjs";

const PACK = join(dirname(fileURLToPath(import.meta.url)), "..");
const FIX = join(PACK, "fixtures/labelled");
const NOW = "2026-09-11T15:00:00.000Z";

function extractEmbeddedReport(html) {
  const m = html.match(
    /<script id="bounty-intelligence-report"[^>]*>([\s\S]*?)<\/script>/,
  );
  assert.ok(m, "embedded report script#bounty-intelligence-report missing");
  return JSON.parse(m[1]);
}

test("fixture report HTML is a full document without site chrome", async () => {
  const ingest = await ingestAll({ mode: "fixture", fixtureDir: FIX, now: NOW });
  const report = buildReport({ ingest, policy: { effortHours: "0" }, now: NOW });
  const html = renderHtml(report);

  assert.match(html, /<!DOCTYPE html>/i);
  assert.match(html, /<html\b/i);
  assert.match(html, /<\/html>/i);
  assert.match(html, /<head\b/i);
  assert.match(html, /<body\b/i);
  assert.doesNotMatch(html, /<nav\b/i);
  assert.doesNotMatch(html, /<(header|div)[^>]*(site-header|global-nav|masthead|site-nav)/i);
  assert.match(html, /Not a site homepage and not global nav/);
  assert.match(html, /Bounty intelligence/);
  assert.ok(
    /Selected claimable task/.test(html) || /No genuinely claimable paid job/.test(html),
    "HTML must contain either selected-claimable or truthful no-match copy",
  );
});

test("ranked table headers include net and unc (or expected useful)", async () => {
  const ingest = await ingestAll({ mode: "fixture", fixtureDir: FIX, now: NOW });
  const report = buildReport({ ingest, policy: { effortHours: "0" }, now: NOW });
  const html = renderHtml(report);
  const hasNetUnc = /<th>\s*net\s*<\/th>/i.test(html) && /<th>\s*unc\s*<\/th>/i.test(html);
  const hasExpectedUseful = /expected useful/i.test(html);
  assert.ok(hasNetUnc || hasExpectedUseful, "ranked headers must include net and unc, or expected useful");
});

test("disclaimers mention not a marketplace and moltbook inaccessible or lab schedule", async () => {
  const ingest = await ingestAll({ mode: "fixture", fixtureDir: FIX, now: NOW });
  const report = buildReport({ ingest, policy: { effortHours: "0" }, now: NOW });
  const html = renderHtml(report);
  assert.match(html, /Not a marketplace/i);
  assert.ok(
    /moltbook[\s\S]{0,80}inaccessible/i.test(html) || /lab schedule/i.test(html),
    "disclaimers must mention moltbook inaccessible or lab schedule",
  );
});

test("embedded JSON script#bounty-intelligence-report parses and selected.match is boolean", async () => {
  const ingest = await ingestAll({ mode: "fixture", fixtureDir: FIX, now: NOW });
  const report = buildReport({ ingest, policy: { effortHours: "0" }, now: NOW });
  const html = renderHtml(report);
  const embedded = extractEmbeddedReport(html);
  assert.equal(typeof embedded.selected.match, "boolean");
});

test("github+neomorphic only report uses truthful no-match copy", async () => {
  const ingest = await ingestAll({
    mode: "fixture",
    fixtureDir: FIX,
    now: NOW,
    adapters: [adapters["github-issues"], adapters["neomorphic-schedule"]],
  });
  const report = buildReport({ ingest, policy: { effortHours: "0" }, now: NOW });
  assert.equal(report.selected.match, false);
  const html = renderHtml(report);
  assert.match(html, /No genuinely claimable paid job/);
  assert.doesNotMatch(html, /Selected claimable task/);
  assert.match(html, /no_genuinely_claimable_paid_job/);
  assert.match(html, /not a failure of ranking weights/i);
  const embedded = extractEmbeddedReport(html);
  assert.equal(embedded.selected.match, false);
  assert.equal(embedded.selected.reason, "no_genuinely_claimable_paid_job");
  assert.ok(embedded.selected.hint);
});
