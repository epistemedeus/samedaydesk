import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { runCli } from "./cli.mjs";
import {
  SCHEMA,
  codesFrom,
  deriveFixtureKey,
  evaluate,
  evaluateFile,
  evaluateSeededFailure,
  fingerprint,
  refusedFlag,
  runCold,
  runSuite,
  signBody,
  validFixtureDir,
} from "./lib.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const cliPath = join(here, "cli.mjs");

function captureCli(argv) {
  const chunks = [];
  const err = [];
  const code = runCli(argv, {
    stdout: { write(text) { chunks.push(text); return true; } },
    stderr: { write(text) { err.push(text); return true; } },
  });
  return { code, stdout: chunks.join(""), stderr: err.join("") };
}

function parse(stdout) {
  return JSON.parse(stdout);
}

test("refuses pay/checkout/neo/publish flags", () => {
  assert.equal(refusedFlag(["--cold", "--pay"]), "--pay");
  assert.equal(refusedFlag(["--neo"]), "--neo");
  assert.equal(refusedFlag(["--publish"]), "--publish");
  assert.equal(refusedFlag(["--checkout"]), "--checkout");
  const paid = captureCli(["--pay", "--cold"]);
  assert.equal(paid.code, 2);
  const body = parse(paid.stdout);
  assert.equal(body.ok, false);
  assert.equal(body.errors[0].code, "money_movement_refused");
});

test("cold journey signs, rotates with overlap, then refuses retired kid", () => {
  const cold = runCold();
  assert.equal(cold.ok, true);
  assert.equal(cold.mode, "cold");
  assert.equal(cold.paid, false);
  assert.equal(cold.secretsEmitted, false);
  assert.equal(cold.overlapMs, 3600000);
  const names = cold.steps.map((step) => step.name);
  assert.deepEqual(names, [
    "sign",
    "verify",
    "rotate",
    "dual-verify",
    "sign-current",
    "expire-overlap",
    "retired-reject",
    "current-after-expire",
  ]);
  for (const step of cold.steps) assert.equal(step.ok, true, step.name);
  assert.equal(cold.steps.find((step) => step.name === "retired-reject").code, "retired_key_after_overlap");
  assert.equal(cold.steps.find((step) => step.name === "retired-reject").naiveAccepted, true);
  const dumped = JSON.stringify(cold);
  assert.equal(dumped.includes(deriveFixtureKey("fixture.a").toString("hex")), false);
  assert.equal(dumped.includes(deriveFixtureKey("fixture.b").toString("hex")), false);
});

test("CLI --cold exits 0 and matches committed fingerprints", () => {
  const ran = captureCli(["--cold"]);
  assert.equal(ran.code, 0, ran.stdout);
  const body = parse(ran.stdout);
  assert.equal(body.ok, true);
  assert.equal(body.fingerprints.a, fingerprint(deriveFixtureKey("fixture.a")));
  assert.equal(body.fingerprints.b, fingerprint(deriveFixtureKey("fixture.b")));
});

test("seeded retired-key-after-overlap: naive accept, honest reject", () => {
  const report = evaluateSeededFailure("retired-key-after-overlap");
  assert.equal(report.ok, true);
  assert.equal(report.rejected, true);
  assert.equal(report.code, "retired_key_after_overlap");
  assert.equal(report.honest.ok, false);
  assert.equal(report.naive.ok, true);
  assert.equal(report.naive.ignoresKeyStatus, true);
});

test("CLI --seeded-failure retired-key-after-overlap exits 0", () => {
  const ran = captureCli(["--seeded-failure", "retired-key-after-overlap"]);
  assert.equal(ran.code, 0, ran.stdout);
  const body = parse(ran.stdout);
  assert.equal(body.rejected, true);
  assert.equal(body.honest.codes.includes("retired_key_after_overlap"), true);
});

test("seeded forged-mac is rejected", () => {
  const report = evaluateSeededFailure("forged-mac");
  assert.equal(report.ok, true);
  assert.equal(report.code, "forged_mac");
  assert.equal(report.honest.ok, false);
});

test("suite accepts valid fixtures and rejects every invalid code", () => {
  const suite = runSuite();
  assert.equal(suite.ok, true, JSON.stringify(suite.results.filter((item) => !item.ok), null, 2));
  assert.equal(suite.failed, 0);
  assert.ok(suite.total >= 12);
});

test("CLI --suite exits 0", () => {
  const ran = captureCli(["--suite"]);
  assert.equal(ran.code, 0, ran.stdout);
  const body = parse(ran.stdout);
  assert.equal(body.ok, true);
});

test("valid verify-current fixture is accepted", () => {
  const result = evaluateFile(join(validFixtureDir(), "verify-current.json"));
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(result.schemaVersion, SCHEMA);
  assert.equal(result.receipts[0].verified, true);
});

test("rotate-overlap promotes current to previous and dual-verifies", () => {
  const result = evaluateFile(join(validFixtureDir(), "rotate-overlap.json"));
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(result.rotation.previousKid, "sds-hmac-2026-09-a");
  assert.equal(result.rotation.currentKid, "sds-hmac-2026-09-b");
  assert.equal(result.rotation.overlapMs, 3600000);
  const statuses = Object.fromEntries(result.keyring.keys.map((item) => [item.kid, item.status]));
  assert.equal(statuses["sds-hmac-2026-09-a"], "previous");
  assert.equal(statuses["sds-hmac-2026-09-b"], "current");
});

test("previous key cannot sign new receipts", () => {
  const result = evaluateFile(join(here, "fixtures/invalid/previous-cannot-sign.json"));
  assert.equal(result.ok, false);
  assert.equal(codesFrom(result).includes("previous_key_cannot_sign"), true);
});

test("invented loyaltyPoints field is refused", () => {
  const result = evaluateFile(join(here, "fixtures/invalid/invented-field.json"));
  assert.equal(result.ok, false);
  assert.equal(codesFrom(result).includes("invented_receipt_field"), true);
});

test("checkout intent is money movement", () => {
  const result = evaluateFile(join(here, "fixtures/invalid/money-movement.json"));
  assert.equal(result.ok, false);
  assert.equal(codesFrom(result).includes("money_movement_refused"), true);
});

test("zero overlap rotation is refused", () => {
  const result = evaluateFile(join(here, "fixtures/invalid/overlap-missing.json"));
  assert.equal(result.ok, false);
  assert.equal(codesFrom(result).includes("overlap_required"), true);
});

test("rotating to the same fingerprint is key_reuse", () => {
  const result = evaluateFile(join(here, "fixtures/invalid/key-reuse.json"));
  assert.equal(result.ok, false);
  assert.equal(codesFrom(result).includes("key_reuse"), true);
});

test("hmacSecret on a receipt is secret_in_pack", () => {
  const result = evaluateFile(join(here, "fixtures/invalid/secret-in-receipt.json"));
  assert.equal(result.ok, false);
  assert.equal(codesFrom(result).includes("secret_in_pack"), true);
});

test("expect-reject on the retired seed exits 0", () => {
  const ran = captureCli([
    "--expect-reject",
    "retired_key_after_overlap",
    join(here, "fixtures/invalid/retired-key-after-overlap.json"),
  ]);
  assert.equal(ran.code, 0, ran.stdout);
});

test("subprocess cold run matches in-process envelope", () => {
  const child = spawnSync(process.execPath, [cliPath, "--cold"], {
    encoding: "utf8",
    cwd: join(here, "../..", ".."),
  });
  assert.equal(child.status, 0, child.stderr + child.stdout);
  const body = JSON.parse(child.stdout);
  assert.equal(body.ok, true);
  assert.equal(body.mode, "cold");
});

test("sign then verify is stable for a fixture label", () => {
  const body = {
    receiptId: "cr_unpaid_extract_402",
    kind: "unpaid_payment_required",
    statusClass: "unpaid",
    origin: "https://agents.samedaydesk.com",
    resource: "https://agents.samedaydesk.com/extract?url=https://example.com",
    route: "/extract",
    method: "GET",
    httpStatus: 402,
    charged: false,
    paymentSent: false,
    observedAt: "2026-09-17T11:30:14.000Z",
    completeness: "truncated",
    authorityClass: "seller_observed",
    accepts: [
      {
        scheme: "exact",
        network: "eip155:8453",
        amount: "5000",
        asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        payTo: "0x8904dF3DE6DFEe6a7C8cc38619d2f17806213Cee",
      },
    ],
  };
  const kid = "sds-hmac-2026-09-a";
  const mac = signBody(deriveFixtureKey("fixture.a"), kid, body);
  const result = evaluate({
    schemaVersion: SCHEMA,
    intent: "verify",
    now: "2026-09-17T12:00:00.000Z",
    keyring: {
      keys: [
        {
          kid,
          label: "fixture.a",
          status: "current",
          notBefore: "2026-09-17T00:00:00.000Z",
          notAfter: null,
        },
      ],
    },
    receipts: [{ receiptId: body.receiptId, kid, mac, body }],
  });
  assert.equal(result.ok, true, JSON.stringify(result.errors));
});
