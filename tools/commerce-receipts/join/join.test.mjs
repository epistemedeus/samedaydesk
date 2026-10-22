import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";
import {
  DECISIONS,
  SCHEMA,
  SEEDED_FAILURES,
  codesFrom,
  invalidFixtureDir,
  listJsonFiles,
  loadInvalidManifest,
  loadJson,
  probe,
  probeFile,
  runSuite,
  validFixtureDir,
} from "./lib.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const cli = join(here, "join.mjs");

function cloneValid(name) {
  return structuredClone(loadJson(join(validFixtureDir(), name)));
}

function spawnCli(args) {
  const env = { ...process.env, NO_COLOR: "1" };
  delete env.FORCE_COLOR;
  return spawnSync(process.execPath, [cli, ...args], {
    encoding: "utf8",
    env,
  });
}

test("three-party fixture joins buyer, seller, and facilitator on transaction_hash", () => {
  const result = probeFile(join(validFixtureDir(), "three-party-transaction-hash.json"));
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(result.decision, DECISIONS.JOINED);
  assert.equal(result.schemaVersion, SCHEMA);
  assert.equal(result.mode, "read_only");
  assert.equal(result.moneyMovement, false);
  assert.equal(result.boundaries.readOnly, true);
  assert.equal(result.boundaries.payment, false);
  assert.equal(result.boundaries.checkout, false);
  assert.equal(result.claims.independentlySettled, false);
  assert.equal(result.claims.sumAcrossAuthorityClasses, false);
  assert.deepEqual(result.parties, ["buyer", "facilitator", "seller"]);
  assert.equal(result.joins.length, 1);
  const joined = result.joins[0];
  assert.equal(joined.exactKey, "transaction_hash");
  assert.equal(joined.exactValue, "0xfeed0000000000000000000000000000000000000000000000000000c0ffee01");
  assert.deepEqual(joined.parties, ["buyer", "facilitator", "seller"]);
  assert.equal(joined.summedUsdc, null);
  assert.equal(joined.independentlySettled, false);
  assert.deepEqual(joined.authorityClasses, ["provider_returned", "seller_observed"]);
  assert.deepEqual(result.unjoined, []);
});

test("two-party fixture joins buyer and seller on receipt_id", () => {
  const result = probeFile(join(validFixtureDir(), "two-party-receipt-id.json"));
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(result.joins[0].exactKey, "receipt_id");
  assert.equal(result.joins[0].exactValue, "rcpt_sds_join_seed_002");
  assert.deepEqual(result.joins[0].parties, ["buyer", "seller"]);
});

test("mixed-case transaction hashes still join", () => {
  const pack = cloneValid("three-party-transaction-hash.json");
  pack.receipts[1].joinKeys.transaction_hash =
    "0xFeEd0000000000000000000000000000000000000000000000000000C0FFEE01";
  const result = probe(pack);
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(
    result.joins[0].exactValue,
    "0xfeed0000000000000000000000000000000000000000000000000000c0ffee01",
  );
});

test("seeded money-movement is refused", () => {
  const result = probeFile(join(invalidFixtureDir(), "money-movement.json"));
  assert.equal(result.ok, false);
  assert.equal(result.decision, DECISIONS.INVALID_INPUT);
  assert.ok(codesFrom(result).includes("money_movement_refused"));
  assert.equal(result.joins.length, 0);
  assert.equal(result.moneyMovement, false);
});

test("seeded join without exact key is refused", () => {
  const result = probeFile(join(invalidFixtureDir(), "join-without-exact-key.json"));
  assert.equal(result.ok, false);
  assert.ok(codesFrom(result).includes("cross_source_join_without_exact_key"));
});

test("pay mode is money movement", () => {
  const result = probeFile(join(invalidFixtureDir(), "pay-mode.json"));
  assert.equal(result.ok, false);
  assert.ok(codesFrom(result).includes("money_movement_refused"));
});

test("POST method is money movement", () => {
  const result = probeFile(join(invalidFixtureDir(), "mutating-http.json"));
  assert.equal(result.ok, false);
  assert.ok(codesFrom(result).includes("money_movement_refused"));
});

test("totalUsdc is refused as a cross-authority sum", () => {
  const result = probeFile(join(invalidFixtureDir(), "sum-across-authority.json"));
  assert.equal(result.ok, false);
  assert.ok(codesFrom(result).includes("sum_across_authority_classes"));
});

test("receipts that share no exact key do not join", () => {
  const pack = cloneValid("two-party-receipt-id.json");
  pack.receipts[1].joinKeys = { operation_id: "op_unrelated_seed" };
  const result = probe(pack);
  assert.equal(result.ok, false);
  assert.ok(codesFrom(result).includes("no_cross_party_join"));
  assert.equal(result.joins.length, 0);
});

test("first classified party owns a duplicate exact key", () => {
  const pack = cloneValid("two-party-receipt-id.json");
  pack.receipts.push({
    party: "buyer",
    sourceKind: "buyer_attested_receipt",
    authorityClass: "provider_returned",
    receiptId: "rcpt_buyer_seed_duplicate",
    joinKeys: { receipt_id: "rcpt_sds_join_seed_002" },
    observedAt: "2026-09-17T01:00:02.000Z",
    status: "attested",
  });
  const result = probe(pack);
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  const buyer = result.joins[0].receipts.find((row) => row.party === "buyer");
  assert.equal(buyer.receiptId, "rcpt_buyer_seed_002");
  assert.ok(result.unjoined.some((row) => row.receiptId === "rcpt_buyer_seed_duplicate"));
});

test("a single party cannot form a cross-party join", () => {
  const pack = cloneValid("two-party-receipt-id.json");
  pack.receipts = [pack.receipts[0], { ...pack.receipts[0], receiptId: "rcpt_buyer_seed_only" }];
  const result = probe(pack);
  assert.equal(result.ok, false);
  assert.ok(codesFrom(result).includes("no_cross_party_join"));
});

test("suite accepts valid fixtures and rejects each invalid fixture", () => {
  const report = runSuite();
  assert.equal(report.failed, 0, JSON.stringify(report.results.filter((item) => !item.ok)));
  assert.equal(report.passed, 7);
  assert.equal(report.total, 7);
});

test("invalid fixtures match the manifest", () => {
  const manifest = loadInvalidManifest();
  const files = listJsonFiles(invalidFixtureDir()).map((filePath) => filePath.split("/").pop());
  assert.deepEqual(files.sort(), Object.keys(manifest).sort());
});

test("CLI joins the three-party fixture", () => {
  const proc = spawnCli(["--input", join(validFixtureDir(), "three-party-transaction-hash.json")]);
  assert.equal(proc.status, 0, proc.stderr);
  const result = JSON.parse(proc.stdout);
  assert.equal(result.ok, true);
  assert.equal(result.decision, "joined");
  assert.equal(result.joins.length, 1);
  assert.equal(result.moneyMovement, false);
});

test("CLI seeded money-movement is quoted and rejected", () => {
  const proc = spawnCli(["--seeded-failure", "money-movement"]);
  assert.equal(proc.status, 0, proc.stderr);
  const result = JSON.parse(proc.stdout);
  assert.equal(result.ok, true);
  assert.equal(result.rejected, true);
  assert.equal(result.code, "money_movement_refused");
  assert.equal(result.message, SEEDED_FAILURES["money-movement"].message);
  assert.match(result.message, /checkout intent is refused/);
});

test("CLI --input of money-movement exits 2 with money_movement_refused", () => {
  const proc = spawnCli(["--input", join(invalidFixtureDir(), "money-movement.json")]);
  assert.equal(proc.status, 2, proc.stderr);
  const result = JSON.parse(proc.stdout);
  assert.equal(result.ok, false);
  assert.ok(result.reasons.includes("money_movement_refused"));
  assert.match(JSON.stringify(result.errors), /checkout|payment, checkout, and settlement/);
});

test("CLI --expect-reject join-without-exact-key", () => {
  const proc = spawnCli([
    "--expect-reject",
    "cross_source_join_without_exact_key",
    join(invalidFixtureDir(), "join-without-exact-key.json"),
  ]);
  assert.equal(proc.status, 0, proc.stderr);
  const result = JSON.parse(proc.stdout);
  assert.equal(result.ok, true);
  assert.equal(result.expectReject, "cross_source_join_without_exact_key");
});

test("CLI --pay is refused as money movement", () => {
  const proc = spawnCli([
    "--pay",
    "--input",
    join(validFixtureDir(), "three-party-transaction-hash.json"),
  ]);
  assert.equal(proc.status, 2, proc.stderr);
  const result = JSON.parse(proc.stdout);
  assert.equal(result.ok, false);
  assert.deepEqual(result.reasons, ["money_movement_refused"]);
});

test("CLI --suite matches the library", () => {
  const proc = spawnCli(["--suite"]);
  assert.equal(proc.status, 0, proc.stderr);
  const report = JSON.parse(proc.stdout);
  assert.equal(report.ok, true);
  assert.equal(report.passed, 7);
  assert.equal(report.failed, 0);
});

test("join sources never fetch, pay, or import stripe", () => {
  const files = ["lib.mjs", "join.mjs"].map((name) => join(here, name));
  for (const filePath of files) {
    const text = readFileSync(filePath, "utf8");
    assert.doesNotMatch(text, /from ["']stripe["']/);
    assert.doesNotMatch(text, /require\(["']stripe["']\)/);
    assert.doesNotMatch(text, /\bfetch\s*\(/);
    assert.doesNotMatch(text, /createPaymentIntent/);
    assert.doesNotMatch(text, /from ["']https["']/);
  }
});
