import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  EXPECTED_BAZAAR_COUNT,
  EXPECTED_BAZAAR_PATHS,
  EXPECTED_READ_DRIFT,
  SEEDED_FAILURE,
  compactRoute,
  comparePair,
  evaluateFile,
  evaluateSeededFailure,
  projectCompact,
  runCold,
  runSuite,
} from "./lib.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const cli = join(here, "cli.mjs");
const extractAligned = join(here, "fixtures/valid/extract-aligned.json");
const receiptOnly = join(here, "fixtures/valid/receipt-only-not-demand.json");
const seedFile = join(here, "fixtures/invalid/read-claimed-match.json");
const absenceFile = join(here, "fixtures/invalid/absence-as-demand.json");
const paidFile = join(here, "fixtures/invalid/paid-as-unpaid.json");
const compactFile = join(here, "fixtures/invalid/payto-in-compact.json");
const floatFile = join(here, "fixtures/invalid/float-money.json");

function runCli(args) {
  return spawnSync(process.execPath, [cli, ...args], { encoding: "utf8" });
}

test("CLI --cold reports eight SDS bazaar routes and the documented /read amount drift", () => {
  const result = runCli(["--cold"]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.ok, true);
  assert.equal(report.command, "cold");
  assert.equal(report.paid, false);
  assert.equal(report.live, false);
  assert.equal(report.network, false);
  assert.equal(report.neo, false);
  assert.equal(report.published, false);
  assert.equal(report.liveCdp, false);
  assert.equal(report.catalogAbsenceIsDemand, false);
  assert.equal(report.absenceIsDemand, false);
  assert.equal(report.bazaarRowCount, EXPECTED_BAZAAR_COUNT);
  assert.deepEqual(report.bazaarPaths, [...EXPECTED_BAZAAR_PATHS]);
  assert.equal(report.alignedCount, 7);
  assert.equal(report.amountDriftCount, 1);
  assert.deepEqual(report.amountDrift, [
    {
      path: "/read",
      bazaarAmount: EXPECTED_READ_DRIFT.bazaarAmount,
      receiptAmount: EXPECTED_READ_DRIFT.receiptAmount,
      buyerDemand: false,
    },
  ]);
  assert.equal(report.receiptOnlyCount, 1);
  assert.equal(report.receiptOnly[0].path, "/commerce/settlement-proof");
  assert.equal(report.receiptOnly[0].buyerDemand, false);
  assert.equal(report.receiptOnly[0].reason, "catalog_absence_is_not_demand");
  const compactBlob = JSON.stringify(report.compactObservation);
  assert.equal(compactBlob.includes("payTo"), false);
  assert.equal(compactBlob.includes("\"amount\""), false);
  for (const row of report.compactObservation) {
    assert.deepEqual(Object.keys(row).sort(), ["digest", "route", "seller", "sellerId", "source"]);
    assert.match(row.digest, /^[0-9a-f]{64}$/);
  }
});

test("CLI --seeded-failure read-claimed-match is naive-accept / honest-reject", () => {
  const result = runCli(["--seeded-failure", SEEDED_FAILURE]);
  assert.equal(result.status, 1, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.ok, false);
  assert.equal(report.error.code, "SEED_REJECT");
  assert.equal(report.result.caught, true);
  assert.equal(report.result.path, "/read");
  assert.equal(report.result.bazaarAmount, "50000");
  assert.equal(report.result.receiptAmount, "5000");
  assert.equal(report.result.naiveVerdict, "accept");
  assert.equal(report.result.honestVerdict, "reject");
  assert.equal(report.result.codes.includes("amount_drift"), true);
  assert.equal(report.result.codes.includes("claim_match"), true);
});

test("CLI --expect-reject amount_drift on the designated seed", () => {
  const result = runCli(["--expect-reject", "amount_drift", seedFile]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.ok, true);
  assert.equal(report.expectReject, "amount_drift");
  assert.equal(report.naiveVerdict, "accept");
  assert.equal(report.honestVerdict, "reject");
});

test("CLI accepts the aligned extract pair", () => {
  const result = runCli([extractAligned]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.ok, true);
  assert.equal(report.path, "/extract");
  assert.equal(report.aligned, true);
  assert.equal(report.bazaarAmount, "5000");
  assert.equal(report.receiptAmount, "5000");
});

test("CLI --suite accepts valid fixtures and rejects invalid ones", () => {
  const result = runCli(["--suite"]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.ok, true);
  assert.equal(report.failed, 0);
  assert.ok(report.total >= 8);
});

test("CLI refuses live, pay, publish, and neo-kernel-vendor", () => {
  for (const flag of ["--live", "--pay", "--publish", "--neo-kernel-vendor"]) {
    const result = runCli([flag]);
    assert.equal(result.status, 2, flag);
    const report = JSON.parse(result.stdout);
    assert.equal(report.ok, false);
    assert.equal(report.error.code, "REFUSED");
  }
});

test("CLI without a mode does not probe the network", () => {
  const result = runCli([]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /bazaar-listing vs unpaid commerce-receipt/);
  assert.match(result.stderr, /neo-kernel-vendor/);
});

test("receipt-only origin route is not buyer demand", () => {
  const result = evaluateFile(receiptOnly);
  assert.equal(result.ok, true);
  assert.equal(result.class, "receipt-only");
  assert.equal(result.buyerDemand, false);
  assert.equal(result.catalogAbsenceIsDemand, false);
});

test("absence-as-demand, paid-as-unpaid, payto-in-compact, and float-money reject", () => {
  const absence = evaluateFile(absenceFile);
  assert.equal(absence.ok, false);
  assert.equal(absence.naiveVerdict, "accept");
  assert.equal(codesIncludes(absence, "absence_as_demand"), true);

  const paid = evaluateFile(paidFile);
  assert.equal(paid.ok, false);
  assert.equal(paid.naiveVerdict, "accept");
  assert.equal(codesIncludes(paid, "paid_as_unpaid"), true);
  assert.match(JSON.stringify(paid), /0x2916cfe2/);

  const compact = evaluateFile(compactFile);
  assert.equal(compact.ok, false);
  assert.equal(codesIncludes(compact, "payto_in_compact"), true);

  const floats = evaluateFile(floatFile);
  assert.equal(floats.ok, false);
  assert.equal(codesIncludes(floats, "float_money"), true);
});

test("compact projection of listing snapshots drops payment terms", () => {
  const listing = {
    resource: "https://agents.samedaydesk.com/extract",
    seller: "SameDayDesk",
    sellerId: "samedaydesk",
    description: "Extract a public page",
    accepts: [{ scheme: "exact", amount: "5000", payTo: "0x8904dF3DE6DFEe6a7C8cc38619d2f17806213Cee" }],
  };
  const compact = compactRoute(listing);
  assert.deepEqual(Object.keys(compact).sort(), ["digest", "route", "seller", "sellerId", "source"]);
  const blob = JSON.stringify(projectCompact([listing]));
  assert.equal(blob.includes("payTo"), false);
  assert.equal(blob.includes("5000"), false);
});

test("comparePair reports /read drift without inventing demand", () => {
  const compared = comparePair(
    {
      resource: "https://agents.samedaydesk.com/read",
      accepts: [{ scheme: "exact", amount: "50000", network: "eip155:8453" }],
    },
    {
      statusClass: "unpaid",
      resource: "https://agents.samedaydesk.com/read?url=https://example.com",
      route: "/read",
      httpStatus: 402,
      charged: false,
      paymentSent: false,
      accepts: [{ scheme: "exact", amount: "5000", network: "eip155:8453" }],
    },
  );
  assert.equal(compared.naiveVerdict, "accept");
  assert.equal(compared.honestVerdict, "reject");
  assert.equal(compared.path, "/read");
  assert.equal(compared.buyerDemand, false);
  assert.equal(compared.errors.some((item) => item.code === "amount_drift"), true);
});

test("runCold and evaluateSeededFailure stay in-process with the same verdicts as the CLI", () => {
  const cold = runCold();
  assert.equal(cold.ok, true);
  assert.equal(cold.amountDriftCount, 1);
  const seed = evaluateSeededFailure();
  assert.equal(seed.caught, true);
  assert.equal(seed.error.code, "SEED_REJECT");
  const suite = runSuite();
  assert.equal(suite.ok, true, JSON.stringify(suite.results.filter((item) => !item.ok), null, 2));
});

function codesIncludes(result, code) {
  return (result.errors ?? []).some((item) => item.code === code);
}
