import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  CASE_SCHEMA,
  PROPOSED_PRICE_USDC,
  evaluateCase,
  evaluateFile,
  loadJson,
  packFixtureDir,
  preserveSettlement,
  runSuite,
  settlementFingerprint,
  settlementsEqual,
} from "./lib.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const cli = join(here, "cli.mjs");
const fixtures = packFixtureDir();

function cloneCase(name) {
  return structuredClone(loadJson(join(fixtures, name)));
}

function runCli(args) {
  return spawnSync(process.execPath, [cli, ...args], {
    encoding: "utf8",
    cwd: join(here, "../.."),
  });
}

test("suite accepts valid and invalid-output cases and rejects seeded failures", () => {
  const report = runSuite();
  assert.equal(report.ok, true, JSON.stringify(report.results, null, 2));
  assert.equal(report.failed, 0);
  assert.ok(report.total >= 8);
});

test("valid match is valid and does not rewrite settlement", () => {
  const input = cloneCase("valid-match.json");
  const result = evaluateCase(input);
  assert.equal(result.ok, true);
  assert.equal(result.decision, "valid");
  assert.equal(result.outputValid, true);
  assert.equal(result.settlementPreserved, true);
  assert.equal(result.settlementMutated, false);
  assert.equal(result.paid, false);
  assert.equal(result.proposal.priceUsdc, PROPOSED_PRICE_USDC);
  assert.equal(result.proposal.live, false);
  assert.deepEqual(result.settlement, input.settlement);
  assert.equal(result.settlementFingerprint, settlementFingerprint(input.settlement));
});

test("invalid output preserves the banked settlement including validDeliveryStatus", () => {
  const input = cloneCase("invalid-output-settlement-preserved.json");
  const before = preserveSettlement(input.settlement);
  const result = evaluateCase(input);
  assert.equal(result.ok, true);
  assert.equal(result.decision, "invalid");
  assert.equal(result.outputValid, false);
  assert.equal(result.settlementPreserved, true);
  assert.equal(result.settlementMutated, false);
  assert.ok(result.findings.some((item) => item.code === "missing_required_path"));
  assert.equal(
    result.settlement.validDeliveryStatus,
    "seller_http_200_repair_required_no_buyer_owned_output_enforcement",
  );
  assert.equal(result.settlement.amountUsdc, "0.010");
  assert.equal(
    result.settlement.transaction,
    "0x2916cfe2c5200fca2a21f8b854fe963ef70d4ed90d59c7444cef16dd21056ef7",
  );
  assert.equal(settlementsEqual(result.settlement, before), true);
  assert.equal(result.settlement.voided, undefined);
  assert.equal(result.settlement.refunded, undefined);
});

test("HTTP 200 with missing paths is invalid delivery, not a settlement void", () => {
  const input = cloneCase("http-200-missing-paths.json");
  const result = evaluateCase(input);
  assert.equal(result.ok, true);
  assert.equal(result.decision, "invalid");
  const codes = result.findings.map((item) => item.code);
  assert.ok(codes.includes("missing_required_path"));
  assert.equal(codes.includes("http_status_not_success"), false);
  assert.deepEqual(result.settlement, input.settlement);
});

test("void-on-invalid is refused and does not emit a mutated settlement", () => {
  const result = evaluateFile(join(fixtures, "seeded-void-settlement.json"));
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "void_settlement_on_invalid_refused");
  assert.equal(result.settlement, null);
  assert.equal(result.settlementMutated, false);
  assert.equal(result.boundary.voidOnInvalidRefused, true);
});

test("live SKU, missing settlement, price rewrite, and refund-on-invalid are refused", () => {
  assert.equal(evaluateFile(join(fixtures, "seeded-live-sku.json")).error.code, "live_sku_refused");
  assert.equal(
    evaluateFile(join(fixtures, "seeded-missing-settlement.json")).error.code,
    "missing_settlement",
  );
  assert.equal(
    evaluateFile(join(fixtures, "seeded-price-rewrite.json")).error.code,
    "price_not_proposed_five_usdc",
  );
  assert.equal(
    evaluateFile(join(fixtures, "seeded-refund-on-invalid.json")).error.code,
    "refund_on_invalid_refused",
  );
});

test("checkout and settlement-patch keys are refused", () => {
  const input = cloneCase("valid-match.json");
  input.checkout = { session: "cs_test" };
  assert.equal(evaluateCase(input).error.code, "checkout_mutation_refused");
  const patched = cloneCase("valid-match.json");
  patched.settlementPatch = { amountUsdc: "0" };
  assert.equal(evaluateCase(patched).error.code, "settlement_mutation_refused");
});

test("schema constant is the case contract", () => {
  assert.equal(cloneCase("valid-match.json").schema, CASE_SCHEMA);
});

test("advertised CLI entry evaluates invalid output and preserves settlement", () => {
  const proc = runCli([
    "evaluate",
    "--pretty",
    "--case",
    "packs/output-contract-evaluation/fixtures/invalid-output-settlement-preserved.json",
  ]);
  assert.equal(proc.status, 0, proc.stderr);
  const body = JSON.parse(proc.stdout);
  assert.equal(body.ok, true);
  assert.equal(body.decision, "invalid");
  assert.equal(body.settlementPreserved, true);
  assert.equal(body.settlementMutated, false);
  assert.equal(body.paid, false);
  assert.equal(body.paymentSent, false);
  assert.equal(body.proposal.priceUsdc, "5.000");
  assert.equal(body.proposal.live, false);
  assert.equal(body.settlement.amountUsdc, "0.010");
  assert.equal(
    body.settlement.validDeliveryStatus,
    "seller_http_200_repair_required_no_buyer_owned_output_enforcement",
  );
  assert.equal(
    body.filePath,
    "packs/output-contract-evaluation/fixtures/invalid-output-settlement-preserved.json",
  );
});

test("seeded void-settlement CLI reject is quoted and exits 1", () => {
  const proc = runCli([
    "evaluate",
    "--pretty",
    "--seed",
    "void-settlement",
  ]);
  assert.equal(proc.status, 1, proc.stdout);
  const body = JSON.parse(proc.stdout);
  assert.equal(body.ok, false);
  assert.equal(body.error.code, "void_settlement_on_invalid_refused");
  assert.equal(body.settlement, null);
});

test("expect-reject turns the seeded void into an exit 0 proof", () => {
  const proc = runCli([
    "evaluate",
    "--seed",
    "void-settlement",
    "--expect-reject",
    "void_settlement_on_invalid_refused",
    "--pretty",
  ]);
  assert.equal(proc.status, 0, proc.stdout);
  const body = JSON.parse(proc.stdout);
  assert.equal(body.ok, true);
  assert.equal(body.expectReject, "void_settlement_on_invalid_refused");
  assert.ok(body.codes.includes("void_settlement_on_invalid_refused"));
});

test("cli --suite is green", () => {
  const proc = runCli(["--suite", "--pretty"]);
  assert.equal(proc.status, 0, proc.stdout);
  const body = JSON.parse(proc.stdout);
  assert.equal(body.ok, true);
});

test("pack bin advertised alias preserves settlement on invalid", () => {
  const packBin = join(here, "../../packs/output-contract-evaluation/bin/evaluate.mjs");
  const proc = spawnSync(
    process.execPath,
    [
      packBin,
      "evaluate",
      "--pretty",
      "--case",
      "fixtures/invalid-output-settlement-preserved.json",
    ],
    { encoding: "utf8", cwd: join(here, "../..") },
  );
  assert.equal(proc.status, 0, proc.stderr + proc.stdout);
  const body = JSON.parse(proc.stdout);
  assert.equal(body.ok, true);
  assert.equal(body.decision, "invalid");
  assert.equal(body.settlementPreserved, true);
});
