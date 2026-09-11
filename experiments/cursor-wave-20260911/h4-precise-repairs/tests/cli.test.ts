import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const packRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const bin = join(packRoot, "bin/h4-precise-repairs.ts");
const mismatch = join(packRoot, "fixtures/mismatch-missing-resource.json");
const missing = join(packRoot, "fixtures/missing-supplied-input.json");

function run(args: string[]) {
  return spawnSync(
    process.execPath,
    ["--experimental-strip-types", bin, ...args],
    { encoding: "utf8", cwd: packRoot },
  );
}

function jsonStdout(result: ReturnType<typeof run>) {
  assert.equal(result.error, undefined, result.stderr);
  const text = String(result.stdout || "").trim();
  assert.ok(text, `empty stdout stderr=${result.stderr}`);
  return JSON.parse(text);
}

test("CLI intake from fixture is provenance=fixture and not a sale", () => {
  const result = run(["intake", "--fixture", mismatch, "--subject", "listing-repair-packet"]);
  assert.equal(result.status, 0, result.stderr);
  const body = jsonStdout(result);
  assert.equal(body.ok, true);
  assert.equal(body.intake.provenance, "fixture");
  assert.equal(body.intake.saleState, "not_a_sale");
  assert.equal(body.paidWrapper, false);
  assert.equal(body.intake.defectId, "g06-missing-resource-hint");
});

test("CLI diagnose reports signed payload vs unsigned hints and does not retry payment", () => {
  const result = run(["diagnose", "--fixture", mismatch]);
  assert.equal(result.status, 0, result.stderr);
  const body = jsonStdout(result);
  assert.equal(body.paymentRetried, false);
  assert.equal(body.signedAuthority, "payload");
  const byField = Object.fromEntries(body.diagnostics.map((row) => [row.field, row]));
  assert.equal(byField.payload.signed, true);
  assert.equal(byField.resource.signed, false);
  assert.equal(byField["extensions.bazaar"].signed, false);
  assert.equal(byField.resource.drift, "missing_hint");
});

test("CLI canary emits unauthorized design JSON and refuses --settle", () => {
  const design = run(["canary", "--route", "extract"]);
  assert.equal(design.status, 0, design.stderr);
  const plan = jsonStdout(design);
  assert.deepEqual(plan.canary, {
    purchaseCap: {
      amount: "5000",
      asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      network: "eip155:8453",
    },
    ownerQa: true,
    externalRevenue: false,
    authorized: false,
  });

  const settle = run(["canary", "--settle"]);
  assert.equal(settle.status, 2);
  const refused = jsonStdout(settle);
  assert.deepEqual(refused.failure, {
    code: "live-settle-refused",
    rejected: true,
    authorized: false,
    settleInvoked: false,
    purchaseInvoked: false,
    reason: "authorized=false canary design must not call live settle",
  });
});

test("CLI --example --customer is fixture-becomes-sale", () => {
  const result = run(["intake", "--example", "--customer"]);
  assert.equal(result.status, 2);
  const body = jsonStdout(result);
  assert.equal(body.failure.code, "fixture-becomes-sale");
  assert.equal(body.completed, false);
});

test("CLI accept-draft of missing supplied input is not a completed repair", () => {
  const result = run(["accept-draft", "--fixture", missing]);
  assert.equal(result.status, 2);
  const body = jsonStdout(result);
  assert.equal(body.failure.code, "missing-supplied-input");
  assert.equal(body.completed, false);
});

test("CLI subjects lists six unpaid repair subjects", () => {
  const result = run(["subjects"]);
  assert.equal(result.status, 0, result.stderr);
  const body = jsonStdout(result);
  assert.equal(body.paidWrapper, false);
  assert.equal(body.subjects.length, 6);
});

test("CLI G01 proposal is not a live job", () => {
  const result = run(["proposal", "--subject", "repeat-job-record"]);
  assert.equal(result.status, 0, result.stderr);
  const body = jsonStdout(result);
  assert.equal(body.id, "G01");
  assert.equal(body.liveJob, false);
  assert.equal(body.fifteenDollarJob, false);
  assert.equal(body.saleState, "not_a_sale");
});
