import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  MATCH_REFUSAL,
  applyCorrection,
  createLocalMarket,
  createSeedCatalog,
  FIXTURE_NOW,
  matchCapabilities,
  runCapability,
  safeCapabilityHref,
  validateCapability,
} from "../src/index.mjs";

const root = dirname(fileURLToPath(import.meta.url));
const hostile = (name) => JSON.parse(readFileSync(join(root, "../fixtures/hostile", name), "utf8"));
const NOW = Date.parse(FIXTURE_NOW);

test("seed catalog reuses SameDayDesk and lab offerings with declared price sources", () => {
  const catalog = createSeedCatalog();
  assert.ok(catalog.length >= 5);
  const batch = catalog.find((c) => c.id === "sdd-batch-extract-v0");
  assert.equal(batch.price.source, "samedaydesk.extract-batch.quote");
  assert.equal(batch.price.amount, "0.01");
  assert.equal(batch.seller.class, "operator");
  assert.equal(batch.demo, false);

  const fixture = catalog.find((c) => c.id === "fixture-demo-echo");
  assert.equal(fixture.seller.class, "fixture_demo");
  assert.match(fixture.seller.label, /FIXTURE DEMO/i);
  assert.equal(fixture.demo, true);

  const lab = catalog.find((c) => c.id === "lab-record-projection");
  assert.equal(lab.executionRoute.href, "/labs/record-lab/");
  assert.equal(lab.layer, "runnable");
});

test("rejects malformed capabilities", () => {
  const raw = hostile("malformed.json");
  const result = validateCapability(raw, { nowMs: NOW });
  assert.equal(result.ok, false);
  assert.ok(result.refusals.includes(MATCH_REFUSAL.MALFORMED_CAPABILITY));
  assert.ok(result.errors.length >= 1);
});

test("rejects deceptive capabilities with reviews, rank, or fake customers", () => {
  const raw = hostile("deceptive.json");
  const result = validateCapability(raw, { nowMs: NOW });
  assert.equal(result.ok, false);
  assert.ok(result.refusals.includes(MATCH_REFUSAL.DECEPTIVE_CAPABILITY));
  assert.ok(result.errors.some((e) => /forbidden|fixture|independent/i.test(e)));
});

test("flags stale prices and keeps them out of preferred match order", () => {
  const stale = hostile("stale-price.json");
  const validation = validateCapability(stale, { nowMs: NOW });
  assert.equal(validation.ok, true);
  assert.equal(validation.stale, true);
  assert.ok(validation.refusals.includes(MATCH_REFUSAL.STALE_PRICE));

  const fresh = createSeedCatalog().find((c) => c.id === "sdd-batch-extract-v0");
  const result = matchCapabilities([stale, fresh], { outcomes: ["batch_extraction"], inputs: { urls: ["https://example.com"] } }, { nowMs: NOW });
  assert.equal(result.matches[0].capability.id, "sdd-batch-extract-v0");
  assert.equal(result.matches[1].capability.id, "hostile-stale-price");
  assert.equal(result.matches[1].stale, true);
});

test("rejects incompatible inputs", () => {
  const fixture = hostile("incompatible-input.json");
  const catalog = createSeedCatalog();
  const result = matchCapabilities(catalog, fixture.request, { nowMs: NOW });
  const rejected = result.rejected.filter((r) => r.refusals.includes(MATCH_REFUSAL.INCOMPATIBLE_INPUT));
  assert.ok(rejected.length >= 1);
  assert.ok(rejected.some((r) => r.id === "sdd-batch-extract-v0"));
});

test("returns no_result for unmatched outcomes", () => {
  const fixture = hostile("no-result.json");
  const result = matchCapabilities(createSeedCatalog(), fixture.request, { nowMs: NOW });
  assert.equal(result.empty, true);
  assert.equal(result.refusal, MATCH_REFUSAL.NO_RESULT);
  assert.equal(result.matches.length, 0);
});

test("correction supersedes without silent rewrite", () => {
  const catalog = createSeedCatalog();
  const correction = hostile("correction.json");
  const next = applyCorrection(catalog, correction);
  const corrected = next.find((c) => c.id === "fixture-demo-echo-v2");
  const prior = next.find((c) => c.id === "fixture-demo-echo");
  assert.ok(corrected);
  assert.equal(corrected.correctsId, "fixture-demo-echo");
  assert.equal(prior.active, false);
  assert.equal(prior.supersededBy, "fixture-demo-echo-v2");
  assert.match(corrected.title, /corrected/i);
});

test("distinguishes advertised, runnable adapter, and delivered evidence", async () => {
  const market = createLocalMarket({ nowMs: NOW });
  const advertisedOnly = await market.run("lab-seller-conformance", { methodPath: "GET /pay" });
  assert.equal(advertisedOnly.ok, false);
  assert.equal(advertisedOnly.reason, "no_runnable_adapter");
  assert.equal(advertisedOnly.advertised.id, "lab-seller-conformance");

  const runnable = await market.run("fixture-demo-echo", { message: "hello-capability" });
  assert.equal(runnable.ok, true);
  assert.equal(runnable.layers.advertised, "fixture-demo-echo");
  assert.equal(runnable.layers.runnable, "fixture-demo-echo");
  assert.equal(runnable.layers.delivered, "evidence");
  assert.equal(runnable.evidence.result.echo, "hello-capability");
  assert.equal(runnable.evidence.evidenceClass, "internal");
});

test("batch fixture adapter never fetches URLs and refuses bad inputs", async () => {
  const capability = createSeedCatalog().find((c) => c.id === "sdd-batch-extract-v0");
  const bad = await runCapability(capability, { urls: "nope" }, { nowMs: NOW });
  assert.equal(bad.ok, false);
  assert.ok(bad.refusals.includes("incompatible_input"));

  const good = await runCapability(capability, { urls: ["https://example.com/a"] }, { nowMs: NOW });
  assert.equal(good.ok, true);
  assert.equal(good.evidence.result.sources[0].status, "fixture_echo");
  assert.match(good.evidence.note, /not fetched/i);
});

test("URL safety boundary blocks unsafe completion links", () => {
  assert.equal(safeCapabilityHref("javascript:alert(1)"), null);
  assert.equal(safeCapabilityHref("http://example.com"), null);
  assert.equal(safeCapabilityHref("https://user:pass@example.com/x"), null);
  assert.equal(safeCapabilityHref("//evil.example/"), null);
  assert.equal(safeCapabilityHref("/labs/record-lab/"), "/labs/record-lab/");
  assert.equal(safeCapabilityHref("https://samedaydesk.com/"), "https://samedaydesk.com/");
});

test("deterministic match order is stable across repeats", () => {
  const catalog = createSeedCatalog();
  const request = { outcomes: ["batch_extraction", "record_projection"], inputs: {} };
  const a = matchCapabilities(catalog, request, { nowMs: NOW });
  const b = matchCapabilities(catalog, request, { nowMs: NOW });
  assert.deepEqual(
    a.matches.map((m) => m.capability.id),
    b.matches.map((m) => m.capability.id),
  );
});
