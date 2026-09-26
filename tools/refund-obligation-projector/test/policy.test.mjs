import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { createAdapters } from "../lib/adapters.mjs";
import { classifyRefundClaim } from "../lib/claim.mjs";
import { CITED_BANKED_USDC, TESTED_BINDINGS } from "../lib/contract.mjs";
import { factsFromPr52Receipt, factsFromSettlement, loadLedgerDocument } from "../lib/facts.mjs";
import { parsePolicy, policiesAreSameDocument } from "../lib/policy.mjs";
import { projectDir, projectDossier, projectRecords } from "../lib/project.mjs";
import { ProjectorRefusal } from "../lib/refuse.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const cli = join(here, "../bin/project.mjs");
const policyDir = join(here, "../fixtures/policy");
const adapters = createAdapters();

function settlementRecords() {
  return adapters.evidence
    .listJsonFiles(adapters.evidence.settlementFixtureDir())
    .map((filePath) => adapters.evidence.loadJson(filePath));
}

function run(args) {
  return spawnSync(process.execPath, [cli, ...args], { encoding: "utf8" });
}

test("Co07: operational repair_required does not invent not-offered without policy", () => {
  const record = settlementRecords().find(
    (item) => item.recordId === "agent402-external-validation-purchase-2026-08-29",
  );
  const facts = factsFromSettlement(record);
  assert.equal(
    facts.delivery,
    "seller_http_200_repair_required_no_buyer_owned_output_enforcement",
  );
  assert.equal(facts.outcomeKind, "operational_error");
  assert.equal(classifyRefundClaim(record), "unknown");

  const report = projectRecords([record], adapters);
  assert.equal(report.ok, true);
  assert.equal(report.projection.records[0].refundClaim, "unknown");
  assert.equal(report.projection.records[0].refundClaimSource, "no_policy");
  assert.equal(report.projection.records[0].outcomeKind, "operational_error");
  assert.equal(JSON.stringify(report.projection).includes(CITED_BANKED_USDC), false);
});

test("Co07: explicit policy can mark the same job not-offered", () => {
  const policy = parsePolicy(adapters.evidence.loadJson(join(policyDir, "agent402-not-offered.json")));
  const report = projectDir(undefined, adapters, { policy });
  assert.equal(report.ok, true);
  const agent402 = report.projection.records.find(
    (row) => row.operationId === "agent402-external-validation-purchase-2026-08-29",
  );
  assert.equal(agent402.refundClaim, "not-offered");
  assert.equal(agent402.refundClaimSource, "explicit_policy");
  assert.equal(agent402.policyId, "sdd-agent402-not-offered");
  assert.equal(agent402.outcomeKind, "operational_error");
  const frantic = report.projection.records.find(
    (row) => row.operationId === "frantic-42-revenue-2026-06-25",
  );
  assert.equal(frantic.refundClaim, "unknown");
  assert.equal(frantic.refundClaimSource, "no_matching_rule");
});

test("Co07: customer dossier omits unrelated banked 8.105 USDC", () => {
  const records = settlementRecords();
  const report = projectDossier(
    "agent402-external-validation-purchase-2026-08-29",
    records,
    adapters,
  );
  assert.equal(report.ok, true);
  assert.equal(report.projection.records.length, 1);
  assert.equal(report.projection.citedBankedUsdcAttached, false);
  assert.equal(Object.hasOwn(report.projection, "citedBankedUsdc"), false);
  assert.equal(JSON.stringify(report.projection).includes(CITED_BANKED_USDC), false);

  const cliResult = run([
    "--operation-id",
    "agent402-external-validation-purchase-2026-08-29",
  ]);
  assert.equal(cliResult.status, 0, cliResult.stderr);
  assert.equal(cliResult.stdout.includes(CITED_BANKED_USDC), false);
  const payload = JSON.parse(cliResult.stdout);
  assert.equal(payload.projection.records[0].refundClaim, "unknown");
});

test("Co07 CLI: --attach-cited-banked is refused", () => {
  const result = run(["--attach-cited-banked"]);
  assert.equal(result.status, 1, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, false);
  assert.equal(payload.code, "cited_banked_usdc_is_not_job_revenue");
});

test("Co07 CLI: explicit attested-delivery policy yields none; without it the same facts stay unknown", () => {
  const without = run([]);
  assert.equal(without.status, 0, without.stderr);
  const unknownRow = JSON.parse(without.stdout).projection.records.find(
    (row) => row.operationId === "what-agents-buy-independent-benchmark-2026-08-30",
  );
  assert.equal(unknownRow.refundClaim, "unknown");
  assert.equal(unknownRow.outcomeKind, "analysis");

  const withPolicy = run(["--policy", join(policyDir, "attested-delivery-none.json")]);
  assert.equal(withPolicy.status, 0, withPolicy.stderr);
  const noneRow = JSON.parse(withPolicy.stdout).projection.records.find(
    (row) => row.operationId === "what-agents-buy-independent-benchmark-2026-08-30",
  );
  assert.equal(noneRow.refundClaim, "none");
  assert.equal(noneRow.refundClaimSource, "explicit_policy");
});

test("unlike terms hashes are not forced equal", () => {
  const a = parsePolicy(adapters.evidence.loadJson(join(policyDir, "attested-delivery-none.json")));
  const b = parsePolicy(adapters.evidence.loadJson(join(policyDir, "other-hash-terms.json")));
  assert.equal(policiesAreSameDocument(a, b), false);
  assert.notEqual(a.termsVersion, b.termsVersion);
  const reportA = projectDir(undefined, adapters, { policy: a });
  const reportB = projectDir(undefined, adapters, { policy: b });
  assert.equal(
    reportA.projection.records.find((row) => row.operationId === "what-agents-buy-independent-benchmark-2026-08-30")
      .policyId,
    "sdd-attested-delivery-none",
  );
  assert.equal(
    reportB.projection.records.find((row) => row.operationId === "what-agents-buy-independent-benchmark-2026-08-30")
      .policyId,
    "sdd-other-hash-policy",
  );
});

test("D13 pin ledger engine_failure overlays outcomeKind and still does not invent policy", () => {
  assert.equal(TESTED_BINDINGS.d13BuyerValueLedger.sha, "aa306e291adfdd499ca971af01625ccc4bfee5c4");
  const ledger = adapters.evidence.loadJson(join(here, "../fixtures/ledger/d13-pin-engine-failure.json"));
  const facts = loadLedgerDocument(ledger);
  assert.equal(facts[0].outcomeKind, "engine_failure");
  const report = projectDir(undefined, adapters, { ledger });
  assert.equal(report.ok, true);
  const agent402 = report.projection.records.find(
    (row) => row.operationId === "agent402-external-validation-purchase-2026-08-29",
  );
  assert.equal(agent402.outcomeKind, "engine_failure");
  assert.equal(agent402.refundClaim, "unknown");
  assert.equal(agent402.delivery, "seller_http_200_repair_required_no_buyer_owned_output_enforcement");

  const cliResult = run(["--ledger", join(here, "../fixtures/ledger/d13-pin-engine-failure.json")]);
  assert.equal(cliResult.status, 0, cliResult.stderr);
  const cliRow = JSON.parse(cliResult.stdout).projection.records.find(
    (row) => row.operationId === "agent402-external-validation-purchase-2026-08-29",
  );
  assert.equal(cliRow.outcomeKind, "engine_failure");
  assert.equal(cliRow.refundClaim, "unknown");
});

test("D13 pin ledger that treats 8.105 as job revenue is refused", () => {
  const ledger = adapters.evidence.loadJson(join(here, "../fixtures/ledger/cited-banked-as-job-revenue.json"));
  assert.throws(
    () => projectDir(undefined, adapters, { ledger }),
    (error) => error instanceof ProjectorRefusal && error.code === "cited_banked_usdc_is_not_job_revenue",
  );
});

test("PR52 receipt valid refusal is analysis, not a projector crash; engine failure stays distinct", () => {
  assert.equal(TESTED_BINDINGS.pr52PaidWrappers.sha, "aeef964fa188443078958d9d6d393afae1d542ee");
  const refused = factsFromPr52Receipt(
    adapters.evidence.loadJson(join(here, "../fixtures/receipt/valid-refusal.json")),
  );
  assert.equal(refused.outcomeKind, "analysis");
  const failed = factsFromPr52Receipt(
    adapters.evidence.loadJson(join(here, "../fixtures/receipt/engine-failure.json")),
  );
  assert.equal(failed.outcomeKind, "engine_failure");

  const analysis = projectDir(undefined, adapters, {
    receipt: adapters.evidence.loadJson(join(here, "../fixtures/receipt/valid-refusal.json")),
  });
  assert.equal(analysis.ok, true);
  const analysisRow = analysis.projection.records.find(
    (row) => row.operationId === "agent402-external-validation-purchase-2026-08-29",
  );
  assert.equal(analysisRow.outcomeKind, "analysis");
  assert.equal(analysisRow.refundClaim, "unknown");

  const engine = projectDir(undefined, adapters, {
    receipt: adapters.evidence.loadJson(join(here, "../fixtures/receipt/engine-failure.json")),
  });
  assert.equal(engine.ok, true);
  assert.equal(
    engine.projection.records.find(
      (row) => row.operationId === "agent402-external-validation-purchase-2026-08-29",
    ).outcomeKind,
    "engine_failure",
  );

  const cliResult = run([
    "--receipt",
    join(here, "../fixtures/receipt/valid-refusal.json"),
    "--operation-id",
    "agent402-external-validation-purchase-2026-08-29",
  ]);
  assert.equal(cliResult.status, 0, cliResult.stderr);
  const cliBody = JSON.parse(cliResult.stdout);
  assert.equal(cliBody.ok, true);
  assert.equal(cliBody.projection.records[0].outcomeKind, "analysis");
  assert.equal(cliBody.projection.records[0].refundClaim, "unknown");
});

test("stripe intake_required becomes not-offered only with explicit policy", () => {
  const record = adapters.evidence.loadJson(join(here, "../fixtures/seeded/stripe-intake-required.json"));
  const without = projectRecords([record], adapters);
  assert.equal(without.projection.records[0].refundClaim, "unknown");
  const policy = parsePolicy(adapters.evidence.loadJson(join(policyDir, "stripe-intake-not-offered.json")));
  const withPolicy = projectRecords([record], adapters, { policy });
  assert.equal(withPolicy.projection.records[0].refundClaim, "not-offered");
  assert.equal(withPolicy.projection.records[0].refundClaimSource, "explicit_policy");
  assert.equal(withPolicy.projection.records[0].outcomeKind, "operational_error");
});

test("integer policy termsVersion is refused at the CLI", () => {
  const result = run(["--policy", join(policyDir, "integer-terms.json")]);
  assert.equal(result.status, 1, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, false);
  assert.equal(payload.code, "integer_terms_version");
});
