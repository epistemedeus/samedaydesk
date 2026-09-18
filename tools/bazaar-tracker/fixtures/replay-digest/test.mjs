import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";
import {
  COMMITTED_EXTRACT_DIGEST,
  EXTRACT_ROUTE,
  LIVE_PAYLOAD_KEYS,
  applyFromReplay,
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
const observationsPath = join(here, "../../../../data/bazaar-tracker/observations.json");

function runJoin(args) {
  return spawnSync(process.execPath, [joinCli, ...args], { encoding: "utf8" });
}

function loadCold() {
  return loadCase(join(here, "cases/cold-extract.json"));
}

test("origin+pathname joins extract query URL to committed route", () => {
  assert.equal(originPathname(EXTRACT_ROUTE), EXTRACT_ROUTE);
  assert.equal(
    originPathname("https://agents.samedaydesk.com/extract?url=https://example.com"),
    EXTRACT_ROUTE,
  );
});

test("cold extract hashes live row, compares committed digest, and does not store payTo", () => {
  const loaded = loadCold();
  const report = evaluateJoin(loaded.caseDoc, {
    observations: loaded.observations,
    observationsPath: loaded.observationsPath,
  });
  const row = liveRowFrom402(loaded.caseDoc.live402.body, { resource: EXTRACT_ROUTE });
  assert.equal(report.ok, true, JSON.stringify(report.reasons));
  assert.equal(report.committed.digest, COMMITTED_EXTRACT_DIGEST);
  assert.equal(report.liveDigest, routeContentDigest(row));
  assert.match(report.liveDigest, /^[0-9a-f]{64}$/);
  assert.notEqual(report.liveDigest, COMMITTED_EXTRACT_DIGEST);
  assert.equal(report.digestMatch, false);
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
  assert.equal(
    report.reasons.includes("route_absent:https://agents.samedaydesk.com/extract/batch"),
    true,
    JSON.stringify(report.reasons),
  );
  assert.equal(report.absenceIsDemand, false);
});

test("treatAbsenceAsDemand is refused even when the extract route is present", () => {
  const loaded = loadCold();
  const caseDoc = structuredClone(loaded.caseDoc);
  caseDoc.claims = { ...caseDoc.claims, treatAbsenceAsDemand: true };
  const report = evaluateJoin(caseDoc, {
    observations: loaded.observations,
    observationsPath: loaded.observationsPath,
  });
  assert.equal(report.ok, false);
  assert.equal(report.reasons.includes("treat_absence_as_demand"), true, JSON.stringify(report.reasons));
  assert.equal(report.reasons.some((reason) => reason.startsWith("route_absent:")), false);
});

test("null or dropped payload.amount is rejected", () => {
  const loaded = loadCold();
  const nullAmount = structuredClone(loaded.caseDoc);
  nullAmount.payloadOverride = { amount: null };
  const nullReport = evaluateJoin(nullAmount, {
    observations: loaded.observations,
    observationsPath: loaded.observationsPath,
  });
  assert.equal(nullReport.ok, false);
  assert.match(nullReport.reasons.join("\n"), /missing_required_payload_key:.*amount/);

  const dropped = loadCase(join(here, "cases/seeded-missing-amount.json"));
  const droppedReport = evaluateJoin(dropped.caseDoc, {
    observations: dropped.observations,
    observationsPath: dropped.observationsPath,
  });
  assert.equal(droppedReport.ok, false);
  assert.match(droppedReport.reasons.join("\n"), /missing_required_payload_key:.*amount/);
});

test("paid provenance on an unpaid 402 is rejected", () => {
  const loaded = loadCase(join(here, "cases/seeded-paid-unpaid-402.json"));
  const report = evaluateJoin(loaded.caseDoc, {
    observations: loaded.observations,
    observationsPath: loaded.observationsPath,
  });
  assert.equal(report.ok, false);
  assert.equal(report.reasons.includes("paid_unpaid_402"), true, JSON.stringify(report.reasons));
  assert.equal(report.paid, false);
});

test("PAYMENT-RESPONSE header on the frozen 402 is rejected", () => {
  const loaded = loadCold();
  const caseDoc = structuredClone(loaded.caseDoc);
  caseDoc.live402.provenance.paymentResponseHeader = true;
  const report = evaluateJoin(caseDoc, {
    observations: loaded.observations,
    observationsPath: loaded.observationsPath,
  });
  assert.equal(report.ok, false);
  assert.equal(report.reasons.includes("payment_response_claimed_on_unpaid_402"), true, JSON.stringify(report.reasons));
});

test("from-replay amount-only compact hit is rejected without payTo", () => {
  const report = applyFromReplay(
    { ok: true, reasons: [], payToStored: false },
    {
      liveDigest: "abc",
      writtenDigest: "abc",
      payToStored: false,
      forbiddenHits: ["sources.cdp-discovery.sellers.samedaydesk.routes.https://agents.samedaydesk.com/extract.amount"],
    },
  );
  assert.equal(report.ok, false);
  assert.equal(report.payToStored, false);
  assert.match(report.reasons.join("\n"), /payment_terms_written_to_compact_observation:.*amount/);
});

test("CLI cold run exits 0 and CLI seeded payTo exits 1", () => {
  const cold = runJoin(["--pretty", join(here, "cases/cold-extract.json")]);
  assert.equal(cold.status, 0, cold.stderr);
  const coldReport = JSON.parse(cold.stdout);
  assert.equal(coldReport.ok, true);
  assert.equal(coldReport.committed.digest, COMMITTED_EXTRACT_DIGEST);
  assert.equal(coldReport.digestMatch, false);
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
  const before = readFileSync(observationsPath, "utf8");
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
    "seeded-missing-amount",
    "seeded-paid-unpaid-402",
    "seeded-store-payto",
  ]);
  assert.equal(report.reports.every((row) => row.ok === true), true);
  assert.equal(readFileSync(observationsPath, "utf8"), before);
});

test("tracker temp --from replay writes digest only and never payTo", async () => {
  const loaded = loadCold();
  const replay = await replayThroughTracker(loaded.caseDoc);
  assert.equal(replay.payToStored, false);
  assert.equal(replay.writtenDigest, replay.liveDigest);
  assert.match(replay.liveDigest, /^[0-9a-f]{64}$/);
  assert.equal(replay.forbiddenHits.length, 0);
});

test("CLI --from-replay cold run stays offline and does not store payTo", () => {
  const result = runJoin(["--from-replay", "--pretty", join(here, "cases/cold-extract.json")]);
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.ok, true);
  assert.equal(report.fromReplay.payToStored, false);
  assert.deepEqual(report.fromReplay.forbiddenHits, []);
  assert.equal(report.fromReplay.writtenDigest, report.liveDigest);
});

test("CLI without a case does not probe the network", () => {
  const result = runJoin([]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /no CDP, no --live, no pay/);
  assert.equal(result.stderr.includes("api.cdp.coinbase.com"), false);
});

test("CLI --live is refused without a parse crash", () => {
  const result = runJoin(["--live", join(here, "cases/cold-extract.json")]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /refuses --live/);
  assert.equal(result.stderr.includes("ERR_PARSE_ARGS_UNKNOWN_OPTION"), false);
});

test("invalid JSON does not leak file bytes", () => {
  const dir = mkdtempSync(join(tmpdir(), "replay-digest-bad-"));
  const path = join(dir, "not-json.json");
  writeFileSync(path, "root:x:0:0:root:/root:/bin/bash\n");
  const result = runJoin([path]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /invalid JSON/);
  assert.equal(result.stderr.includes("root:x:0:0"), false);
});

test("live402Path outside the fixture directory is refused", () => {
  const dir = mkdtempSync(join(tmpdir(), "replay-digest-escape-"));
  const path = join(dir, "escape.json");
  writeFileSync(path, `${JSON.stringify({
    id: "seeded-path-escape",
    kind: "seeded",
    live402Path: "/etc/passwd",
    httpStatus: 402,
    committedRoute: EXTRACT_ROUTE,
  })}\n`);
  const result = runJoin([path]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /outside the replay-digest fixture directory/);
  assert.equal(result.stderr.includes("root:"), false);
});

test("tracker CLI still refuses to run with no mode (no live)", () => {
  const result = spawnSync(process.execPath, [trackerCli], { encoding: "utf8" });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /--live/);
});
