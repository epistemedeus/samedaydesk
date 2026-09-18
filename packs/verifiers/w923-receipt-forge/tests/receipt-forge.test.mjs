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
  pinCommittedArtifacts,
  runCold,
  runSuite,
  validateFile,
} from "../src/lib.mjs";
import { digestClaim, stampIntegrity } from "../src/digest.mjs";
import { EXTRACT_AMOUNT, KNOWN_SETTLEMENT, PACK, PRODUCT, SDS_PIN } from "../src/constants.mjs";

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
  assert.equal(catalog.pack, PACK);
  assert.equal(catalog.product, PRODUCT);
  assert.equal(catalog.pin.origin, SDS_PIN.origin);
  assert.equal(catalog.pin.payTo, SDS_PIN.payTo);
  assert.equal(catalog.pin.extractAmount, EXTRACT_AMOUNT);
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
    assert.equal(claim.accepts[0].amount, EXTRACT_AMOUNT);
    assert.equal(claim.accepts[0].payTo, SDS_PIN.payTo);
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

test("cold suite pins committed SDS artifacts and rejects seeded forges", () => {
  const report = runCold(catalog);
  assert.equal(report.pin.ok, true, JSON.stringify(report.pin.errors, null, 2));
  assert.equal(report.suite.ok, true, JSON.stringify(report.suite.results.filter((item) => !item.ok), null, 2));
  assert.equal(report.ok, true);
  assert.equal(report.suite.total, 8);
  assert.equal(report.live, false);
  assert.equal(report.paymentSent, false);
});

test("fixture-only suite still accepts valid and rejects forges", () => {
  const report = runSuite(catalog);
  assert.equal(report.ok, true, JSON.stringify(report.results.filter((item) => !item.ok), null, 2));
  assert.equal(report.total, 8);
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
  restored.accepts[0].amount = EXTRACT_AMOUNT;
  assert.equal(claim.integrity.claimedDigest, digestClaim(restored));
  assert.equal(naiveVerdict(claim), "accept");
  assert.equal(evaluateClaim(claim, catalog).ok, false);
});

test("CLI --cold exits 0 against committed SDS artifacts", () => {
  const proc = runCli(["--cold"]);
  assert.equal(proc.status, 0, proc.stderr + proc.stdout);
  const body = JSON.parse(proc.stdout);
  assert.equal(body.ok, true);
  assert.equal(body.command, "cold");
  assert.equal(body.live, false);
  assert.equal(body.paymentSent, false);
  assert.equal(body.pin.ok, true);
  assert.equal(body.pin.extractAmount, EXTRACT_AMOUNT);
  assert.equal(body.pin.payTo, SDS_PIN.payTo);
  assert.equal(body.pin.settlementTransaction, KNOWN_SETTLEMENT.transaction);
  assert.equal(body.passed, 9);
  assert.equal(body.failed, 0);
  assert.equal(body.total, 9);
});

test("CLI verifies the real unpaid extract fixture", () => {
  const file = "packs/verifiers/w923-receipt-forge/fixtures/valid/unpaid-402-extract.json";
  const proc = runCli([file]);
  assert.equal(proc.status, 0, proc.stderr + proc.stdout);
  const body = JSON.parse(proc.stdout);
  assert.equal(body.ok, true);
  assert.equal(body.results[0].honestVerdict, "accept");
  assert.equal(body.results[0].receiptId, "cr_w923_unpaid_extract_402");
  assert.equal(body.live, false);
});

test("CLI rejects the seeded forged-digest file", () => {
  const file = "packs/verifiers/w923-receipt-forge/fixtures/reject/forged-digest.json";
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
  const file = "packs/verifiers/w923-receipt-forge/fixtures/reject/forged-digest.json";
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
  ];
  for (const [name, code] of cases) {
    const proc = runCli([
      "--expect-reject",
      code,
      `packs/verifiers/w923-receipt-forge/fixtures/reject/${name}`,
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

test("committed pin helper matches CLI --cold pin", () => {
  const pin = pinCommittedArtifacts();
  assert.equal(pin.ok, true, JSON.stringify(pin.errors, null, 2));
  assert.equal(pin.extractAmount, "5000");
  assert.match(pin.files.x402Catalog, /x402\.json$/);
  assert.match(pin.files.settlement, /agent402-external-validation-purchase-2026-08-29\.json$/);
});
