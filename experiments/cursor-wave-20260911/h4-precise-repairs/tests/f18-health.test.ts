import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import type { CorpusFixture } from "../src/corpus-types.ts";
import { REQUIRED_CORPUS_IDS } from "../src/corpus-types.ts";
import {
  AGENTS_GATEWAY_ORIGIN,
  AGENTS_LIVE_PROBE_PATH,
  AGENTS_UNSUPPORTED_HEALTH_PATH,
  C31_RECIPE_HEALTH_PATH,
  diagnoseHealthSurface,
  F18_HEALTH_RECORDED_PROBES,
  readMachineEntryHealthFacts,
  readSdsExpressHealthOnDisk,
  recommendsRewriteSdsApiHealth,
  reproduceF18Health,
  SDS_EXPRESS_HEALTH_PATH,
  SDS_EXPRESS_ORIGIN,
} from "../src/f18-health.ts";
import { PACK_ROOT, REPO_ROOT } from "../src/paths.ts";

const packRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

test("GET /health on agents gateway is unsupported (F18 reproduction)", () => {
  const diagnosis = diagnoseHealthSurface({
    origin: AGENTS_GATEWAY_ORIGIN,
    path: AGENTS_UNSUPPORTED_HEALTH_PATH,
    status: 404,
    body: { error: "Not found" },
  });
  assert.equal(diagnosis.surface, "agents-gateway");
  assert.equal(diagnosis.path, "/health");
  assert.equal(diagnosis.supported, false);
  assert.equal(diagnosis.liveProbe, false);
  assert.equal(diagnosis.f18Defect, true);
  assert.equal(diagnosis.rewriteSdsApiHealth, false);
  assert.match(diagnosis.notes, /F18 reproduction/);
  assert.match(diagnosis.notes, /unsupported/);
  assert.equal(recommendsRewriteSdsApiHealth(diagnosis.notes), false);

  const recorded = F18_HEALTH_RECORDED_PROBES.find(
    (row) => row.origin === AGENTS_GATEWAY_ORIGIN && row.path === "/health",
  );
  assert.ok(recorded);
  assert.equal(recorded?.status, 404);
  assert.equal(recorded?.source, "fixture");
});

test("GET /healthz on agents gateway is the live probe", () => {
  const diagnosis = diagnoseHealthSurface({
    origin: AGENTS_GATEWAY_ORIGIN,
    path: AGENTS_LIVE_PROBE_PATH,
    status: 200,
    body: { ok: true },
  });
  assert.equal(diagnosis.surface, "agents-gateway");
  assert.equal(diagnosis.path, "/healthz");
  assert.equal(diagnosis.supported, true);
  assert.equal(diagnosis.liveProbe, true);
  assert.equal(diagnosis.f18Defect, false);
  assert.equal(diagnosis.rewriteSdsApiHealth, false);
  assert.match(diagnosis.notes, /Live agents gateway probe/);
  assert.equal(recommendsRewriteSdsApiHealth(diagnosis.notes), false);
});

test("SDS GET /api/health exists on disk and is not the F18 defect", () => {
  const healthJs = readFileSync(join(REPO_ROOT, "server/routes/health.js"), "utf8");
  assert.match(healthJs, /router\.get\("\/health"/);
  assert.match(healthJs, /service:\s*"samedaydesk"/);

  const appJs = readFileSync(join(REPO_ROOT, "server/app.js"), "utf8");
  assert.match(appJs, /app\.use\(\s*"\/api"\s*,\s*healthRouter\s*\)/);

  const onDisk = readSdsExpressHealthOnDisk();
  assert.equal(onDisk.containsRouterGetHealth, true);
  assert.equal(onDisk.mountedAtApi, true);
  assert.equal(onDisk.treatedAsF18Defect, false);
  assert.equal(onDisk.rewriteSdsApiHealth, false);

  const diagnosis = diagnoseHealthSurface({
    origin: SDS_EXPRESS_ORIGIN,
    path: SDS_EXPRESS_HEALTH_PATH,
    status: 200,
    body: { ok: true, service: "samedaydesk" },
  });
  assert.equal(diagnosis.surface, "sds-express");
  assert.equal(diagnosis.path, "/api/health");
  assert.equal(diagnosis.supported, true);
  assert.equal(diagnosis.liveProbe, false);
  assert.equal(diagnosis.f18Defect, false);
  assert.match(diagnosis.notes, /Not the F18/);
  assert.equal(recommendsRewriteSdsApiHealth(diagnosis.notes), false);
});

test("machineEntry.mjs LIVE_INVENTORY health still points at /healthz", () => {
  const text = readFileSync(join(REPO_ROOT, "client/src/data/machineEntry.mjs"), "utf8");
  assert.match(text, /export const GATEWAY_ORIGIN = "https:\/\/agents\.samedaydesk\.com"/);

  const liveStart = text.indexOf("export const LIVE_INVENTORY");
  const liveEnd = text.indexOf("\nexport const ", liveStart + 1);
  assert.ok(liveStart >= 0);
  const liveBlock = text.slice(liveStart, liveEnd >= 0 ? liveEnd : text.length);
  assert.match(
    liveBlock,
    /label:\s*"Health, prices, and protocol route counts"\s*,\s*href:\s*`\$\{GATEWAY_ORIGIN\}\/healthz`/,
  );
  assert.equal(liveBlock.includes("${GATEWAY_ORIGIN}/health`"), false);

  const facts = readMachineEntryHealthFacts();
  assert.equal(facts.gatewayOrigin, AGENTS_GATEWAY_ORIGIN);
  assert.equal(facts.liveInventoryHealthHref, `${AGENTS_GATEWAY_ORIGIN}/healthz`);
  assert.equal(facts.liveInventoryPointsAtHealthz, true);
  assert.equal(facts.liveInventoryPointsAtUnsupportedHealth, false);
  assert.equal(
    facts.c31RecipeHealth,
    `${AGENTS_GATEWAY_ORIGIN}${C31_RECIPE_HEALTH_PATH}`,
  );
});

test("diagnostic must not recommend rewriting SDS /api/health", () => {
  const cases = [
    diagnoseHealthSurface({ origin: AGENTS_GATEWAY_ORIGIN, path: "/health", status: 404 }),
    diagnoseHealthSurface({ origin: AGENTS_GATEWAY_ORIGIN, path: "/healthz", status: 200 }),
    diagnoseHealthSurface({ origin: SDS_EXPRESS_ORIGIN, path: "/api/health", status: 200 }),
    diagnoseHealthSurface({ origin: AGENTS_GATEWAY_ORIGIN, path: C31_RECIPE_HEALTH_PATH }),
    diagnoseHealthSurface({ origin: "https://example.invalid", path: "/health" }),
  ];
  for (const diagnosis of cases) {
    assert.equal(diagnosis.rewriteSdsApiHealth, false, diagnosis.path);
    assert.equal(recommendsRewriteSdsApiHealth(diagnosis.notes), false, diagnosis.notes);
    assert.match(diagnosis.notes, /Do not rewrite SDS Express GET \/api\/health/);
  }
});

test("reproduceF18Health returns the recorded fixture table without mutating routes", async () => {
  const reproduction = await reproduceF18Health({ live: false });
  assert.equal(reproduction.id, "F18-health");
  assert.equal(reproduction.evaluator, "f18-health");
  assert.equal(reproduction.disposition, "reproduced");
  assert.equal(reproduction.authorized, false);
  assert.equal(reproduction.provenance, "fixture");
  assert.equal(reproduction.saleState, "not_a_sale");
  assert.equal(reproduction.productionRoutesMutated, false);
  assert.equal(reproduction.rewriteSdsApiHealth, false);
  assert.equal(reproduction.liveNetworkUsed, false);
  assert.equal(reproduction.liveObservations, null);

  const byPath = Object.fromEntries(
    reproduction.diagnoses.map((row) => [`${row.surface}:${row.path}`, row]),
  );
  assert.equal(byPath["agents-gateway:/health"].supported, false);
  assert.equal(byPath["agents-gateway:/health"].liveProbe, false);
  assert.equal(byPath["agents-gateway:/health"].f18Defect, true);
  assert.equal(byPath["agents-gateway:/healthz"].supported, true);
  assert.equal(byPath["agents-gateway:/healthz"].liveProbe, true);
  assert.equal(byPath["sds-express:/api/health"].supported, true);
  assert.equal(byPath["sds-express:/api/health"].liveProbe, false);
  assert.equal(byPath["sds-express:/api/health"].f18Defect, false);

  assert.equal(reproduction.sdsExpressHealthOnDisk.containsRouterGetHealth, true);
  assert.equal(reproduction.machineEntry.liveInventoryPointsAtHealthz, true);
});

test("corpus fixture F18-health.json matches the pack contract", () => {
  const raw = readFileSync(join(PACK_ROOT, "fixtures/corpus/F18-health.json"), "utf8");
  const fixture = JSON.parse(raw) as CorpusFixture;
  assert.equal(fixture.id, "F18-health");
  assert.equal((REQUIRED_CORPUS_IDS as readonly string[]).includes(String(fixture.id)), true);
  assert.equal(fixture.disposition, "reproduced");
  assert.equal(fixture.inSdsScope, true);
  assert.equal(fixture.saleState, "not_a_sale");
  assert.equal(fixture.provenance, "fixture");
  assert.equal(fixture.authorized, false);
  assert.equal(fixture.kind, "reproduction");
  assert.equal(fixture.evaluator, "f18-health");
  assert.equal(fixture.briefPath, "briefs/_child-03-f18-health.md");
  assert.equal(typeof fixture.notes, "string");
  assert.ok(fixture.notes.length > 0);
  assert.equal(fixture.facts.rewriteSdsApiHealth, false);
  assert.equal(fixture.facts.unsupportedPath, "/health");
  assert.equal(fixture.facts.liveProbePath, "/healthz");
  assert.equal(fixture.facts.sdsExpressPath, "/api/health");

  const brief = readFileSync(join(packRoot, "briefs/_child-03-f18-health.md"), "utf8");
  assert.match(brief, /GATEWAY_ORIGIN/);
  assert.match(brief, /\$\{GATEWAY_ORIGIN\}\/healthz/);
  assert.match(brief, /router\.get\("\/health"/);
  assert.match(brief, /app\.use\("\/api", healthRouter\)/);
});
