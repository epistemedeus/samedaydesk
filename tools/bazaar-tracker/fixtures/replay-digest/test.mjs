import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  COMMITTED_EXTRACT_DIGEST,
  EXTRACT_ROUTE,
  LIVE_PAYLOAD_KEYS,
  compactForbiddenHits,
  evaluateJoin,
  liveRowFrom402,
  loadCase,
  originPathname,
  replayThroughTracker,
} from "./join.mjs";
import { routeContentDigest } from "../../lib.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const joinCli = join(here, "join.mjs");
const trackerCli = join(here, "../../cli.mjs");

function runJoin(args) {
  return spawnSync(process.execPath, [joinCli, ...args], { encoding: "utf8" });
}

test("origin+pathname joins extract query URL to committed route", () => {
  assert.equal(originPathname(EXTRACT_ROUTE), EXTRACT_ROUTE);
  assert.equal(
    originPathname("https://agents.samedaydesk.com/extract?url=https://example.com"),
    EXTRACT_ROUTE,
  );
});

test("cold extract hashes live row, compares committed digest, and does not store payTo", () => {
  const loaded = loadCase(join(here, "cases/cold-extract.json"));
  const report = evaluateJoin(loaded.caseDoc, {
    observations: loaded.observations,
    observationsPath: loaded.observationsPath,
  });
  const row = liveRowFrom402(loaded.caseDoc.live402.body, { resource: EXTRACT_ROUTE });
  assert.equal(report.ok, true, JSON.stringify(report.reasons));
  assert.equal(report.committed.digest, COMMITTED_EXTRACT_DIGEST);
  assert.equal(report.liveDigest, routeContentDigest(row));
  assert.match(report.liveDigest, /^[0-9a-f]{64}$/);
  assert.equal(report.digestMatch, report.liveDigest === COMMITTED_EXTRACT_DIGEST);
  assert.deepEqual(report.payloadKeys, [...LIVE_PAYLOAD_KEYS]);
  assert.equal(report.amountMatchesAccepts, true);
  assert.equal(report.payToPresent, true);
  assert.equal(report.payToStored, false);
  assert.equal(report.absenceIsDemand, false);
  assert.equal(report.live, false);
  assert.equal(report.paid, false);
  assert.deepEqual(Object.keys(report.compactObservation), ["digest"]);
  assert.equal(JSON.stringify(report.compactObservation).includes("payTo"), false);
  assert.equal(compactForbiddenHits(report.compactObservation).length, 0);
  assert.equal(report.joinKey.match, true);
});

test("seeded compact payTo write is rejected", () => {
  const loaded = loadCase(join(here, "cases/seeded-store-payto.json"));
  const report = evaluateJoin(loaded.caseDoc, {
    observations: loaded.observations,
    observationsPath: loaded.observationsPath,
  });
  assert.equal(report.ok, false);
  assert.equal(report.reasons.includes("payto_written_to_compact_observation"), true, JSON.stringify(report.reasons));
  assert.equal(report.payToStored, true);
});

test("seeded loyaltyPoints payload key is rejected", () => {
  const loaded = loadCase(join(here, "cases/seeded-invented-field.json"));
  const report = evaluateJoin(loaded.caseDoc, {
    observations: loaded.observations,
    observationsPath: loaded.observationsPath,
  });
  assert.equal(report.ok, false);
  assert.match(report.reasons.join("\n"), /invented_receipt_field_without_live_schema:.*loyaltyPoints/);
  assert.match(report.reasons.join("\n"), /throughBlock/);
});

test("seeded payload amount 1 vs accepts 5000 is rejected without unit conversion", () => {
  const loaded = loadCase(join(here, "cases/seeded-amount-mismatch.json"));
  const report = evaluateJoin(loaded.caseDoc, {
    observations: loaded.observations,
    observationsPath: loaded.observationsPath,
  });
  assert.equal(report.ok, false);
  assert.equal(report.amountMatchesAccepts, false);
  assert.equal(report.reasons.includes("amount_mismatch:accepts=5000,payload=1"), true, JSON.stringify(report.reasons));
});

test("seeded extract/batch absence is not demand", () => {
  const loaded = loadCase(join(here, "cases/seeded-absence-as-demand.json"));
  const report = evaluateJoin(loaded.caseDoc, {
    observations: loaded.observations,
    observationsPath: loaded.observationsPath,
  });
  assert.equal(report.ok, false);
  assert.equal(report.reasons.includes("treat_absence_as_demand"), true, JSON.stringify(report.reasons));
  assert.equal(report.absenceIsDemand, false);
});

test("CLI cold run exits 0 and CLI seeded payTo exits 1", () => {
  const cold = runJoin(["--pretty", join(here, "cases/cold-extract.json")]);
  assert.equal(cold.status, 0, cold.stderr);
  const coldReport = JSON.parse(cold.stdout);
  assert.equal(coldReport.ok, true);
  assert.equal(coldReport.committed.digest, COMMITTED_EXTRACT_DIGEST);
  assert.equal(coldReport.payToStored, false);

  const seeded = runJoin(["--pretty", join(here, "cases/seeded-store-payto.json")]);
  assert.equal(seeded.status, 1, seeded.stderr);
  const seededReport = JSON.parse(seeded.stdout);
  assert.equal(seededReport.ok, false);
  assert.equal(seededReport.reasons.includes("payto_written_to_compact_observation"), true);

  const antiGreenwash = runJoin(["--seeded", join(here, "cases/seeded-store-payto.json")]);
  assert.equal(antiGreenwash.status, 0, antiGreenwash.stderr);
});

test("CLI --suite passes cold and rejects every seeded case", () => {
  const suite = runJoin(["--suite", "--pretty"]);
  assert.equal(suite.status, 0, suite.stderr + suite.stdout);
  const report = JSON.parse(suite.stdout);
  assert.equal(report.ok, true);
  const ids = report.reports.map((row) => row.id).sort();
  assert.deepEqual(ids, [
    "cold-extract",
    "seeded-absence-as-demand",
    "seeded-amount-mismatch",
    "seeded-invented-field",
    "seeded-store-payto",
  ]);
  assert.equal(report.reports.every((row) => row.ok === true), true);
});

test("tracker temp --from replay writes digest only and never payTo", async () => {
  const loaded = loadCase(join(here, "cases/cold-extract.json"));
  const replay = await replayThroughTracker(loaded.caseDoc, { observations: loaded.observations });
  assert.equal(replay.payToStored, false);
  assert.equal(replay.writtenDigest, replay.liveDigest);
  assert.match(replay.liveDigest, /^[0-9a-f]{64}$/);
  assert.equal(replay.forbiddenHits.length, 0);
});

test("CLI without a case does not probe the network", () => {
  const result = runJoin([]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /no CDP, no --live, no pay/);
  assert.equal(result.stderr.includes("api.cdp.coinbase.com"), false);
});

test("tracker CLI still refuses to run with no mode (no live)", () => {
  const result = spawnSync(process.execPath, [trackerCli], { encoding: "utf8" });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /--live/);
});
