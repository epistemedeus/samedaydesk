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
  const file = "packs/verifiers/w803-receipt-forge/fixtures/valid/unpaid-402-extract.json";
  const proc = runCli([file]);
  assert.equal(proc.status, 0, proc.stderr + proc.stdout);
  const body = JSON.parse(proc.stdout);
  assert.equal(body.ok, true);
  assert.equal(body.results[0].honestVerdict, "accept");
  assert.equal(body.results[0].receiptId, "cr_w803_unpaid_extract_402");
  assert.equal(body.live, false);
});

test("CLI rejects the seeded forged-digest file", () => {
  const file = "packs/verifiers/w803-receipt-forge/fixtures/reject/forged-digest.json";
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
  const file = "packs/verifiers/w803-receipt-forge/fixtures/reject/forged-digest.json";
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
      `packs/verifiers/w803-receipt-forge/fixtures/reject/${name}`,
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

test("CLI refuses --pay=now and --live=true as JSON REFUSED", () => {
  for (const flag of ["--pay=now", "--live=true"]) {
    const proc = runCli([flag, "--cold"]);
    assert.equal(proc.status, 2, flag);
    const body = JSON.parse(proc.stdout);
    assert.equal(body.ok, false);
    assert.equal(body.error.code, "REFUSED");
  }
});

test("CLI usage errors are JSON USAGE exit 2", () => {
  const empty = runCli([]);
  assert.equal(empty.status, 2);
  const emptyBody = JSON.parse(empty.stdout);
  assert.equal(emptyBody.ok, false);
  assert.equal(emptyBody.error.code, "USAGE");

  const mixed = runCli(["--cold", "packs/verifiers/w803-receipt-forge/fixtures/valid/unpaid-402-extract.json"]);
  assert.equal(mixed.status, 2);
  const mixedBody = JSON.parse(mixed.stdout);
  assert.equal(mixedBody.ok, false);
  assert.equal(mixedBody.error.code, "USAGE");
});

test("X-PAYMENT-RESPONSE and padded payment header names are payment_header_forge", () => {
  const original = loadJson(join(VALID_FIXTURES, "unpaid-402-extract.json"));
  const responseHeader = stampIntegrity({
    ...structuredClone(original),
    claimId: "rf_w803_x_payment_response",
    receiptId: "cr_w803_x_payment_response",
    request: {
      ...original.request,
      headers: { Accept: "application/json", "X-PAYMENT-RESPONSE": "forged" },
    },
  });
  const responseResult = evaluateClaim(responseHeader, catalog);
  assert.equal(responseResult.ok, false);
  assert.ok(responseResult.codes.includes("payment_header_forge"), JSON.stringify(responseResult.codes));

  const padded = stampIntegrity({
    ...structuredClone(original),
    claimId: "rf_w803_padded_payment_header",
    receiptId: "cr_w803_padded_payment_header",
    request: {
      ...original.request,
      headers: { Accept: "application/json", " X-PAYMENT ": "forged" },
    },
  });
  const paddedResult = evaluateClaim(padded, catalog);
  assert.equal(paddedResult.ok, false);
  assert.ok(paddedResult.codes.includes("payment_header_forge"), JSON.stringify(paddedResult.codes));
});

test("known settlement on its bound unpaid-labeled claim is paid_as_unpaid", () => {
  const original = loadJson(join(VALID_FIXTURES, "unpaid-402-extract.json"));
  const bound = stampIntegrity({
    ...structuredClone(original),
    claimId: "rf_w803_paid_as_unpaid_bound",
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
  assert.equal(result.ok, false, JSON.stringify(result.codes));
  assert.equal(result.naiveVerdict, "accept");
  assert.equal(result.honestVerdict, "reject");
  assert.ok(result.codes.includes("paid_as_unpaid"), JSON.stringify(result.codes));
  assert.equal(result.codes.includes("copied_settlement"), false);
});

test("resource longer than 2048 is invalid_shape", () => {
  const original = loadJson(join(VALID_FIXTURES, "unpaid-402-extract.json"));
  const longUrl = `${original.resource}&pad=${"a".repeat(2100)}`;
  const claim = stampIntegrity({
    ...structuredClone(original),
    claimId: "rf_w803_long_resource",
    receiptId: "cr_w803_long_resource",
    resource: longUrl,
    request: { ...original.request, url: longUrl },
  });
  const result = evaluateClaim(claim, catalog);
  assert.equal(result.ok, false);
  assert.ok(result.codes.includes("invalid_shape"), JSON.stringify(result.codes));
  assert.ok(result.errors.some((item) => item.path === "$.resource"));
});

test("extract fixtures copy the committed catalog URL exactly", () => {
  const x402 = loadJson(join(repoRoot, "fixtures/presence/catalog/x402.json"));
  const extract = x402.items.find((item) => item?.resource?.routeTemplate === "/extract");
  assert.equal(typeof extract.resource.url, "string");
  const claim = loadJson(join(VALID_FIXTURES, "unpaid-402-extract.json"));
  assert.equal(claim.resource, extract.resource.url);
  assert.equal(claim.request.url, extract.resource.url);
});

test("route must equal resource pathname", () => {
  const original = loadJson(join(VALID_FIXTURES, "unpaid-402-extract.json"));
  const claim = stampIntegrity({
    ...structuredClone(original),
    claimId: "rf_w803_route_mismatch",
    receiptId: "cr_w803_route_mismatch",
    route: "/scan",
  });
  const result = evaluateClaim(claim, catalog);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((item) => item.path === "$.route"), JSON.stringify(result.errors));
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
