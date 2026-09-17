import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  DEFAULT_SCHEMA,
  FIXTURE_ROOT,
  INVALID_FIXTURES,
  ROOT,
  SEEDED_FAILURE,
  VALID_FIXTURES,
  collectPaidEvidence,
  designatedSeedPath,
  evaluateRecord,
  evaluateSeededFailure,
  listJsonFiles,
  loadCatalog,
  loadInvalidManifest,
  loadJson,
  loadSchema,
  naiveVerdict,
  runSuite,
  validateFile,
  validateRecord,
} from "./lib.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const cli = join(here, "cli.mjs");
const catalog = loadCatalog();

function runCli(args) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 2 * 1024 * 1024,
  });
}

function cloneValid(name) {
  return structuredClone(loadJson(join(VALID_FIXTURES, name)));
}

test("catalog, schema, and designated seed agree", () => {
  const schema = loadSchema(DEFAULT_SCHEMA);
  assert.equal(schema.properties.schemaVersion.const, catalog.recordSchemaVersion);
  assert.deepEqual(schema.properties.kind.enum, catalog.kinds);
  assert.equal(schema.properties.statusClass.const, "unpaid");
  assert.equal(schema.properties.charged.const, false);
  assert.equal(schema.properties.paymentSent.const, false);
  assert.equal(schema.additionalProperties, false);
  assert.equal(catalog.designatedSeed.id, SEEDED_FAILURE);
  assert.equal(catalog.designatedSeed.code, "paid_as_unpaid");
  assert.equal(catalog.pack, "unpaid-only");
  assert.equal(catalog.pin.origin, "https://agents.samedaydesk.com");
});

test("every valid fixture is accepted as unpaid", () => {
  const files = listJsonFiles(VALID_FIXTURES);
  assert.equal(files.length, 7);
  for (const filePath of files) {
    const result = validateFile(filePath, catalog);
    assert.equal(result.ok, true, `${basename(filePath)}: ${JSON.stringify(result.errors)}`);
    assert.equal(result.statusClass, "unpaid");
    assert.equal(result.honestVerdict, "accept");
    const record = loadJson(filePath);
    assert.equal(record.charged, false);
    assert.equal(record.paymentSent, false);
    assert.equal(collectPaidEvidence(record).length, 0);
  }
});

test("every invalid fixture is rejected with the declared code", () => {
  const manifest = loadInvalidManifest();
  const files = listJsonFiles(INVALID_FIXTURES);
  assert.deepEqual(
    files.map((filePath) => basename(filePath)).sort(),
    Object.keys(manifest).sort(),
  );
  for (const [name, spec] of Object.entries(manifest)) {
    const result = validateFile(join(INVALID_FIXTURES, name), catalog);
    assert.equal(result.ok, false, name);
    assert.ok(
      result.errors.some((item) => item.code === spec.code),
      `${name} missing ${spec.code}: ${JSON.stringify(result.errors)}`,
    );
  }
});

test("suite accepts unpaid fixtures and rejects each invalid code", () => {
  const report = runSuite(catalog);
  assert.equal(report.failed, 0, JSON.stringify(report.results.filter((item) => !item.ok)));
  assert.equal(report.passed, 14);
  assert.equal(report.total, 14);
});

test("designated paid-as-unpaid seed is naive-accept honest-reject", () => {
  const seed = evaluateSeededFailure(catalog);
  assert.equal(seed.caught, true, JSON.stringify(seed));
  assert.equal(seed.error.code, "SEED_REJECT");
  assert.equal(seed.result.naiveVerdict, "accept");
  assert.equal(seed.result.honestVerdict, "reject");
  assert.ok(seed.result.codes.includes("paid_as_unpaid"));
  const record = loadJson(designatedSeedPath(catalog));
  assert.equal(record.statusClass, "unpaid");
  assert.equal(record.charged, false);
  assert.equal(record.paymentSent, false);
  assert.equal(naiveVerdict(record), "accept");
  assert.match(record.settlement.transaction, /^0x[a-f0-9]{64}$/);
});

test("CLI --suite exits 0", () => {
  const result = runCli(["--suite"]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const body = JSON.parse(result.stdout);
  assert.equal(body.ok, true);
  assert.equal(body.failed, 0);
  assert.equal(body.total, 14);
});

test("CLI --seeded-failure paid-as-unpaid exits 1 with SEED_REJECT", () => {
  const result = runCli(["--seeded-failure", "paid-as-unpaid"]);
  assert.equal(result.status, 1, result.stderr || result.stdout);
  const body = JSON.parse(result.stdout);
  assert.equal(body.ok, false);
  assert.equal(body.seed, "paid-as-unpaid");
  assert.equal(body.error.code, "SEED_REJECT");
  assert.match(body.error.message, /seeded paid-as-unpaid caught/);
  assert.equal(body.result.naiveVerdict, "accept");
  assert.equal(body.result.honestVerdict, "reject");
  assert.ok(body.result.codes.includes("paid_as_unpaid"));
  assert.equal(body.result.caught, true);
});

test("CLI rejects the paid-as-unpaid fixture file", () => {
  const file = "fixtures/commerce-receipts/invalid/paid-as-unpaid.json";
  const result = runCli([file]);
  assert.equal(result.status, 1, result.stderr || result.stdout);
  const body = JSON.parse(result.stdout);
  assert.equal(body.ok, false);
  assert.ok(body.results[0].codes.includes("paid_as_unpaid"));
});

test("CLI --expect-reject paid_as_unpaid on the seed exits 0", () => {
  const file = "fixtures/commerce-receipts/invalid/paid-as-unpaid.json";
  const result = runCli(["--expect-reject", "paid_as_unpaid", file]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const body = JSON.parse(result.stdout);
  assert.equal(body.ok, true);
  assert.equal(body.expectReject, "paid_as_unpaid");
});

test("CLI accepts a valid unpaid 402 fixture", () => {
  const file = "fixtures/commerce-receipts/valid/unpaid-402-extract.json";
  const result = runCli([file]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const body = JSON.parse(result.stdout);
  assert.equal(body.ok, true);
  assert.equal(body.results[0].honestVerdict, "accept");
});

test("CLI refuses --live and --pay", () => {
  for (const flag of ["--live", "--pay", "--checkout", "--publish", "--registry"]) {
    const result = runCli([flag, "--suite"]);
    assert.equal(result.status, 2, flag);
    const body = JSON.parse(result.stdout);
    assert.equal(body.error.code, "REFUSED");
  }
});

test("charged true labeled unpaid is paid_as_unpaid", () => {
  const record = cloneValid("unpaid-402-extract.json");
  record.charged = true;
  const result = evaluateRecord(record, catalog);
  assert.equal(result.ok, false);
  assert.ok(result.codes.includes("paid_as_unpaid"));
  assert.equal(result.naiveVerdict, "accept");
});

test("PAYMENT-SIGNATURE labeled unpaid is paid_as_unpaid", () => {
  const record = cloneValid("unpaid-402-extract.json");
  record.request.headers["X-PAYMENT"] = "seeded";
  const result = validateRecord(record, catalog);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((item) => item.code === "paid_as_unpaid"));
});

test("statusClass paid is not_unpaid even without settlement", () => {
  const record = cloneValid("unpaid-402-extract.json");
  record.statusClass = "paid";
  const result = evaluateRecord(record, catalog);
  assert.equal(result.ok, false);
  assert.ok(result.codes.includes("not_unpaid"));
  assert.equal(result.naiveVerdict, "reject");
});

test("offer payload amount mismatch is rejected", () => {
  const record = cloneValid("unpaid-offer-receipt-extract.json");
  record.offerReceipt.offers[0].payload.amount = "10000";
  const result = validateRecord(record, catalog);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((item) => item.code === "offer_accept_mismatch"));
});

test("valid fixtures never carry a payment header or settlement", () => {
  for (const filePath of listJsonFiles(VALID_FIXTURES)) {
    const raw = readFileSync(filePath, "utf8");
    assert.doesNotMatch(raw, /"PAYMENT-SIGNATURE"|"X-PAYMENT"|"PAYMENT-RESPONSE"/);
    const record = loadJson(filePath);
    assert.equal(Object.hasOwn(record, "settlement"), false, basename(filePath));
    assert.notEqual(record.offerReceipt?.receipt != null, true, basename(filePath));
  }
});

test("unknown --seeded-failure is usage exit 2", () => {
  const result = runCli(["--seeded-failure", "false-accept"]);
  assert.equal(result.status, 2, result.stdout);
  const body = JSON.parse(result.stdout);
  assert.equal(body.error.code, "USAGE");
});

test("lib and CLI stay inside the write boundary and do not pay", () => {
  const lib = readFileSync(join(here, "lib.mjs"), "utf8");
  const cliSrc = readFileSync(cli, "utf8");
  for (const src of [lib, cliSrc]) {
    assert.doesNotMatch(src, /stripe\.(paymentIntents|checkout)/);
    assert.doesNotMatch(src, /fetch\(/);
    assert.doesNotMatch(src, /npm publish/);
  }
  assert.match(FIXTURE_ROOT, /fixtures\/commerce-receipts$/);
});
