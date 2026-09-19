import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  DEFAULT_SCHEMA,
  REJECT_FIXTURES,
  SEEDED_FAILURE,
  VALID_FIXTURES,
  designatedSeedPath,
  evaluateClaim,
  evaluateSeededFailure,
  listJsonFiles,
  loadCatalog,
  loadJson,
  loadRejectManifest,
  loadSchema,
  naiveVerdict,
  runSuite,
  validateFile,
} from "../src/lib.mjs";
import { digestClaim, stampIntegrity } from "../src/digest.mjs";
import { KNOWN_SETTLEMENT, SDS_PIN } from "../src/constants.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const packRoot = join(here, "..");
const cli = join(packRoot, "bin", "receipt-forge.mjs");
const repoRoot = join(packRoot, "../../..");
const catalog = loadCatalog();

function runCli(args) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 2 * 1024 * 1024,
  });
}

test("catalog, schema, and designated seed agree", () => {
  const schema = loadSchema(DEFAULT_SCHEMA);
  assert.equal(schema.properties.schemaVersion.const, catalog.recordSchemaVersion);
  assert.equal(schema.properties.statusClass.const, "unpaid");
  assert.equal(schema.properties.charged.const, false);
  assert.equal(schema.properties.paymentSent.const, false);
  assert.equal(schema.additionalProperties, false);
  assert.equal(catalog.designatedSeed.id, SEEDED_FAILURE);
  assert.equal(catalog.designatedSeed.code, "receipt_forged");
  assert.equal(catalog.pack, "receipt-forge-reject");
  assert.equal(catalog.pin.origin, SDS_PIN.origin);
  assert.equal(catalog.pin.payTo, SDS_PIN.payTo);
  assert.equal(catalog.boundary.live, false);
  assert.equal(catalog.boundary.paymentSent, false);
  assert.equal(catalog.pin.settlements[0].transaction, KNOWN_SETTLEMENT.transaction);
});

test("every valid fixture is accepted with a matching digest", () => {
  const files = listJsonFiles(VALID_FIXTURES);
  assert.equal(files.length, 2);
  for (const filePath of files) {
    const result = validateFile(filePath, catalog);
    assert.equal(result.ok, true, `${basename(filePath)}: ${JSON.stringify(result.errors)}`);
    assert.equal(result.statusClass, "unpaid");
    assert.equal(result.honestVerdict, "accept");
    assert.equal(result.naiveVerdict, "accept");
    const claim = loadJson(filePath);
    assert.equal(claim.charged, false);
    assert.equal(claim.paymentSent, false);
    assert.equal(claim.integrity.claimedDigest, digestClaim(claim));
    assert.equal(Object.hasOwn(claim, "settlement"), false);
  }
});

test("every reject fixture is rejected with the declared code", () => {
  const manifest = loadRejectManifest();
  const files = listJsonFiles(REJECT_FIXTURES);
  assert.deepEqual(
    files.map((filePath) => basename(filePath)).sort(),
    Object.keys(manifest).sort(),
  );
  for (const filePath of files) {
    const spec = manifest[basename(filePath)];
    const result = validateFile(filePath, catalog);
    assert.equal(result.ok, false, basename(filePath));
    assert.equal(result.honestVerdict, "reject");
    assert.ok(result.codes.includes(spec.code), `${basename(filePath)} missing ${spec.code}: ${result.codes}`);
  }
});

test("cold suite accepts valid and rejects seeded forges", () => {
  const report = runSuite(catalog);
  assert.equal(report.ok, true, JSON.stringify(report.results.filter((item) => !item.ok), null, 2));
  assert.equal(report.total, 11);
  assert.equal(report.failed, 0);
});

test("seeded forged-digest is naive-accept honest-reject", () => {
  const seed = evaluateSeededFailure(catalog);
  assert.equal(seed.caught, true, JSON.stringify(seed, null, 2));
  assert.equal(seed.ok, true);
  assert.equal(seed.result.naiveVerdict, "accept");
  assert.equal(seed.result.honestVerdict, "reject");
  assert.ok(seed.result.codes.includes("receipt_forged"));
  assert.notEqual(seed.result.claimedDigest, seed.result.actualDigest);

  const claim = loadJson(designatedSeedPath(catalog));
  assert.equal(claim.accepts[0].amount, "1");
  const restored = structuredClone(claim);
  restored.accepts[0].amount = "5000";
  assert.equal(claim.integrity.claimedDigest, digestClaim(restored));
  assert.equal(naiveVerdict(claim), "accept");
  assert.equal(evaluateClaim(claim, catalog).ok, false);
});

test("CLI --cold exits 0", () => {
  const proc = runCli(["--cold"]);
  assert.equal(proc.status, 0, proc.stderr + proc.stdout);
  const body = JSON.parse(proc.stdout);
  assert.equal(body.ok, true);
  assert.equal(body.command, "cold");
  assert.equal(body.live, false);
  assert.equal(body.paymentSent, false);
  assert.equal(body.passed, 11);
  assert.equal(body.failed, 0);
});

test("CLI verifies the real unpaid extract fixture", () => {
  const file = "packs/verifiers/receipt-forge-w7/fixtures/valid/unpaid-402-extract.json";
  const proc = runCli([file]);
  assert.equal(proc.status, 0, proc.stderr + proc.stdout);
  const body = JSON.parse(proc.stdout);
  assert.equal(body.ok, true);
  assert.equal(body.results[0].honestVerdict, "accept");
  assert.equal(body.results[0].receiptId, "cr_unpaid_extract_402");
  assert.equal(body.live, false);
});

test("CLI rejects the seeded forged-digest file", () => {
  const file = "packs/verifiers/receipt-forge-w7/fixtures/reject/forged-digest.json";
  const proc = runCli([file]);
  assert.equal(proc.status, 1, proc.stderr + proc.stdout);
  const body = JSON.parse(proc.stdout);
  assert.equal(body.ok, false);
  assert.equal(body.results[0].naiveVerdict, "accept");
  assert.equal(body.results[0].honestVerdict, "reject");
  assert.ok(body.results[0].codes.includes("receipt_forged"));
});

test("CLI --seeded-failure forged-digest catches the seed", () => {
  const proc = runCli(["--seeded-failure", "forged-digest"]);
  assert.equal(proc.status, 0, proc.stderr + proc.stdout);
  const body = JSON.parse(proc.stdout);
  assert.equal(body.ok, true);
  assert.equal(body.rejected, true);
  assert.equal(body.code, "receipt_forged");
  assert.equal(body.result.caught, true);
  assert.equal(body.result.naiveVerdict, "accept");
  assert.equal(body.result.honestVerdict, "reject");
});

test("CLI --expect-reject receipt_forged on the seed", () => {
  const file = "packs/verifiers/receipt-forge-w7/fixtures/reject/forged-digest.json";
  const proc = runCli(["--expect-reject", "receipt_forged", file]);
  assert.equal(proc.status, 0, proc.stderr + proc.stdout);
  const body = JSON.parse(proc.stdout);
  assert.equal(body.ok, true);
  assert.equal(body.expectReject, "receipt_forged");
});

test("CLI copied-settlement, fabricated-tx, replay, payment header, payTo swap", () => {
  const cases = [
    ["copied-settlement.json", "copied_settlement"],
    ["fabricated-tx.json", "fabricated_settlement"],
    ["replay-receipt.json", "receipt_replay"],
    ["payment-header-forge.json", "payment_header_forge"],
    ["payto-swap.json", "pin_mismatch"],
    ["paid-as-unpaid.json", "paid_as_unpaid"],
    ["bound-receipt-replay.json", "receipt_replay"],
    ["route-url-mismatch.json", "invalid_shape"],
  ];
  for (const [name, code] of cases) {
    const proc = runCli([
      "--expect-reject",
      code,
      `packs/verifiers/receipt-forge-w7/fixtures/reject/${name}`,
    ]);
    assert.equal(proc.status, 0, `${name} ${proc.stderr} ${proc.stdout}`);
  }
});

test("CLI refuses --live --pay --publish --neo", () => {
  for (const flag of ["--live", "--pay", "--publish", "--neo", "--checkout", "--payment"]) {
    const proc = runCli([flag, "--cold"]);
    assert.equal(proc.status, 2, flag);
    const body = JSON.parse(proc.stdout);
    assert.equal(body.ok, false);
    assert.equal(body.error.code, "REFUSED");
  }
});

test("mutating a valid receipt after stamping is receipt_forged", () => {
  const original = loadJson(join(VALID_FIXTURES, "unpaid-402-extract.json"));
  const tampered = structuredClone(original);
  tampered.accepts[0].payTo = "0x000000000000000000000000000000000000dEaD";
  const result = evaluateClaim(tampered, catalog);
  assert.equal(result.ok, false);
  assert.ok(result.codes.includes("receipt_forged"));
  assert.ok(result.codes.includes("pin_mismatch"));
  const restamped = stampIntegrity(tampered);
  const restampedResult = evaluateClaim(restamped, catalog);
  assert.equal(restampedResult.ok, false);
  assert.ok(restampedResult.codes.includes("pin_mismatch"));
  assert.equal(restampedResult.codes.includes("receipt_forged"), false);
});

test("bound facilitator settlement on unpaid is paid_as_unpaid, not accept", () => {
  const extract = loadJson(join(VALID_FIXTURES, "unpaid-402-extract.json"));
  const bound = stampIntegrity({
    ...structuredClone(extract),
    claimId: "rf_probe_bound",
    receiptId: KNOWN_SETTLEMENT.boundReceiptId,
    resource: KNOWN_SETTLEMENT.boundResource,
    route: KNOWN_SETTLEMENT.boundRoute,
    request: {
      method: "GET",
      url: KNOWN_SETTLEMENT.boundResource,
      headers: { Accept: "application/json" },
    },
    settlement: {
      operationId: KNOWN_SETTLEMENT.operationId,
      amountUsdc: KNOWN_SETTLEMENT.amountUsdc,
      transaction: KNOWN_SETTLEMENT.transaction,
      facilitatorOrPayoutRef: KNOWN_SETTLEMENT.facilitatorOrPayoutRef,
    },
  });
  const result = evaluateClaim(bound, catalog);
  assert.equal(result.ok, false);
  assert.equal(result.honestVerdict, "reject");
  assert.ok(result.codes.includes("paid_as_unpaid"));
  assert.ok(result.codes.includes("receipt_replay"));
});

test("resource, route, and request.url must name one SDS surface", () => {
  const extract = loadJson(join(VALID_FIXTURES, "unpaid-402-extract.json"));
  const split = stampIntegrity({
    ...structuredClone(extract),
    claimId: "rf_mismatch_probe",
    receiptId: "cr_mismatch_probe",
    route: KNOWN_SETTLEMENT.boundRoute,
    request: {
      method: "GET",
      url: KNOWN_SETTLEMENT.boundResource,
      headers: { Accept: "application/json" },
    },
  });
  delete split.settlement;
  const result = evaluateClaim(split, catalog);
  assert.equal(result.ok, false);
  assert.ok(result.codes.includes("invalid_shape"));
  assert.equal(result.codes.includes("receipt_forged"), false);
});
