import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  DEFAULT_MATRIX,
  FIXTURE_ROOT,
  INVALID_FIXTURES,
  PACK,
  PACK_ROOT,
  ROOT,
  SEEDED_FAILURES,
  VALID_FIXTURES,
  WAVE,
  atomicToDisplay,
  collectForgedSettlement,
  collectPaidEvidence,
  coverageReport,
  crossCheckInTreePins,
  designatedSeedPath,
  evaluateAllSeededFailures,
  evaluateRecord,
  evaluateSeededFailure,
  listJsonFiles,
  loadInvalidManifest,
  loadJson,
  loadMatrix,
  naiveVerdict,
  runSuite,
  validateFile,
  validateRecord,
} from "./lib.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const cli = join(here, "cli.mjs");
const matrix = loadMatrix();

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

test("matrix pin is POST /extract/batch 10000 with GET /extract 5000 contrast", () => {
  assert.equal(matrix.pack, PACK);
  assert.equal(matrix.wave, WAVE);
  assert.equal(matrix.pin.origin, "https://agents.samedaydesk.com");
  assert.equal(matrix.pin.network, "eip155:8453");
  assert.equal(matrix.pin.decimals, 6);
  assert.equal(matrix.primary.method, "POST");
  assert.equal(matrix.primary.route, "/extract/batch");
  assert.equal(matrix.primary.amountAtomic, "10000");
  assert.equal(matrix.primary.amountDisplayUsd, "0.01");
  assert.equal(matrix.primary.urlCountMin, 1);
  assert.equal(matrix.primary.urlCountMax, 5);
  assert.equal(matrix.primary.quoteKind, "flat_attempt");
  assert.equal(matrix.contrast.method, "GET");
  assert.equal(matrix.contrast.route, "/extract");
  assert.equal(matrix.contrast.amountAtomic, "5000");
  assert.equal(atomicToDisplay("10000"), "0.01");
  assert.equal(atomicToDisplay("5000"), "0.005");
  assert.deepEqual(
    matrix.designatedSeeds.map((item) => item.id),
    SEEDED_FAILURES,
  );
});

test("in-tree pins match 10000 / 0.01 and catalog GET /extract 5000", () => {
  const cross = crossCheckInTreePins(matrix);
  assert.equal(cross.ok, true, JSON.stringify(cross.findings));
  assert.equal(cross.catalogItems, 23);
  assert.equal(cross.catalogHasExtractBatch, false);
  assert.equal(cross.catalogExtractAmount, "5000");
  assert.equal(cross.primaryAmountAtomic, "10000");
});

test("1-URL and 5-URL unpaid fixtures share the flat 10000 amount", () => {
  const coverage = coverageReport(matrix);
  assert.equal(coverage.ok, true, JSON.stringify(coverage));
  assert.equal(coverage.flatQuote, true);
  assert.ok(coverage.urlCounts.includes(1));
  assert.ok(coverage.urlCounts.includes(5));
  assert.deepEqual(coverage.amounts, ["10000"]);
  assert.equal(coverage.missingPrimary, false);
});

test("every valid fixture is accepted as unpaid POST /extract/batch 10000", () => {
  const files = listJsonFiles(VALID_FIXTURES);
  assert.equal(files.length, 3);
  for (const filePath of files) {
    const result = validateFile(filePath, matrix);
    assert.equal(result.ok, true, `${basename(filePath)}: ${JSON.stringify(result.errors)}`);
    assert.equal(result.statusClass, "unpaid");
    assert.equal(result.honestVerdict, "accept");
    const record = loadJson(filePath);
    assert.equal(record.method, "POST");
    assert.equal(record.route, "/extract/batch");
    assert.equal(record.amountAtomic, "10000");
    assert.equal(record.amountDisplayUsd, "0.01");
    assert.equal(record.charged, false);
    assert.equal(record.paymentSent, false);
    assert.equal(record.httpStatus, 402);
    assert.equal(collectPaidEvidence(record).length, 0);
    assert.equal(collectForgedSettlement(record).length, 0);
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
    const result = validateFile(join(INVALID_FIXTURES, name), matrix);
    assert.equal(result.ok, false, name);
    assert.ok(
      result.codes.includes(spec.code),
      `${name} expected ${spec.code}, got ${JSON.stringify(result.codes)}`,
    );
    assert.equal(result.naiveVerdict, "accept", name);
    assert.equal(result.honestVerdict, "reject", name);
  }
});

test("suite accepts valid unpaid fixtures and rejects invalid ones", () => {
  const report = runSuite(matrix);
  assert.equal(report.ok, true, JSON.stringify(report.results.filter((item) => !item.ok)));
  assert.equal(report.failed, 0);
});

test("CLI --cold exits 0 for the unpaid extract/batch amount matrix", () => {
  const result = runCli(["--cold"]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const body = JSON.parse(result.stdout);
  assert.equal(body.ok, true);
  assert.equal(body.command, "cold");
  assert.equal(body.route, "POST /extract/batch");
  assert.equal(body.amountAtomic, "10000");
  assert.equal(body.coverage.flatQuote, true);
  assert.equal(body.crossCheck.ok, true);
  assert.equal(body.crossCheck.catalogHasExtractBatch, false);
  assert.equal(body.boundary.paymentSent, false);
  assert.equal(body.boundary.live, false);
  assert.equal(body.failed, 0);
});

test("CLI --matrix prints the extract/batch pin without network", () => {
  const result = runCli(["--matrix"]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const body = JSON.parse(result.stdout);
  assert.equal(body.ok, true);
  assert.equal(body.primary.amountAtomic, "10000");
  assert.equal(body.contrast.amountAtomic, "5000");
});

test("CLI --seeded-failure all exits 1 with SEED_REJECT for all three seeds", () => {
  const result = runCli(["--seeded-failure", "all"]);
  assert.equal(result.status, 1, result.stderr || result.stdout);
  const body = JSON.parse(result.stdout);
  assert.equal(body.ok, false);
  assert.equal(body.seed, "all");
  assert.equal(body.error.code, "SEED_REJECT");
  assert.equal(body.caught, true);
  assert.equal(body.boundary.paymentSent, false);
  const byId = Object.fromEntries(body.results.map((item) => [item.seed, item]));
  assert.equal(byId["wrong-amount"].caught, true);
  assert.ok(byId["wrong-amount"].codes.includes("wrong_amount"));
  assert.equal(byId["wrong-amount"].naiveVerdict, "accept");
  assert.equal(byId["wrong-amount"].honestVerdict, "reject");
  assert.equal(byId["wrong-amount"].amountAtomic, "5000");
  assert.equal(byId["missing-amount"].caught, true);
  assert.ok(byId["missing-amount"].codes.includes("missing_amount"));
  assert.equal(byId["forged-settlement"].caught, true);
  assert.ok(byId["forged-settlement"].codes.includes("forged_settlement"));
});

for (const seed of SEEDED_FAILURES) {
  test(`CLI --seeded-failure ${seed} exits 1 with SEED_REJECT`, () => {
    const result = runCli(["--seeded-failure", seed]);
    assert.equal(result.status, 1, result.stderr || result.stdout);
    const body = JSON.parse(result.stdout);
    assert.equal(body.ok, false);
    assert.equal(body.seed, seed);
    assert.equal(body.error.code, "SEED_REJECT");
    assert.equal(body.result.caught, true);
    assert.equal(body.result.naiveVerdict, "accept");
    assert.equal(body.result.honestVerdict, "reject");
    const code = matrix.designatedSeeds.find((item) => item.id === seed).code;
    assert.ok(body.result.codes.includes(code));
  });
}

test("CLI rejects the wrong-amount fixture file", () => {
  const file = "tools/verify-sds/batch-extract-402-w7/fixtures/invalid/wrong-amount.json";
  const result = runCli([file]);
  assert.equal(result.status, 1, result.stderr || result.stdout);
  const body = JSON.parse(result.stdout);
  assert.equal(body.ok, false);
  assert.ok(body.results[0].codes.includes("wrong_amount"));
  assert.ok(body.results[0].codes.includes("get_extract_rewrite"));
});

test("CLI --expect-reject wrong_amount on the seed exits 0", () => {
  const file = "tools/verify-sds/batch-extract-402-w7/fixtures/invalid/wrong-amount.json";
  const result = runCli(["--expect-reject", "wrong_amount", file]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const body = JSON.parse(result.stdout);
  assert.equal(body.ok, true);
  assert.equal(body.expectReject, "wrong_amount");
});

test("CLI accepts a valid unpaid extract/batch 10000 fixture", () => {
  const file = "tools/verify-sds/batch-extract-402-w7/fixtures/valid/unpaid-402-extract-batch-10000-one.json";
  const result = runCli([file]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const body = JSON.parse(result.stdout);
  assert.equal(body.ok, true);
  assert.equal(body.results[0].honestVerdict, "accept");
  assert.equal(body.results[0].amountAtomic, "10000");
});

test("CLI refuses --live, --pay, --payment, --publish, and --neo", () => {
  for (const flag of ["--live", "--pay", "--payment", "--checkout", "--publish", "--registry", "--neo"]) {
    const result = runCli([flag, "--cold"]);
    assert.equal(result.status, 2, flag);
    const body = JSON.parse(result.stdout);
    assert.equal(body.error.code, "REFUSED");
  }
});

test("10000 atomic claimed as 10000 dollars is wrong_units", () => {
  const record = cloneValid("unpaid-402-extract-batch-10000-one.json");
  record.amountDisplayUsd = "10000";
  const result = evaluateRecord(record, matrix);
  assert.equal(result.ok, false);
  assert.ok(result.codes.includes("wrong_units"));
  assert.equal(result.naiveVerdict, "accept");
});

test("extract/batch 5000 is wrong_amount against pin 10000", () => {
  const record = cloneValid("unpaid-402-extract-batch-10000-one.json");
  record.amountAtomic = "5000";
  record.amountDisplayUsd = "0.005";
  const result = validateRecord(record, matrix);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((item) => item.code === "wrong_amount"));
  assert.ok(result.errors.some((item) => item.code === "get_extract_rewrite"));
});

test("omitted amountAtomic is missing_amount and naive-accept", () => {
  const record = cloneValid("unpaid-402-extract-batch-10000-one.json");
  delete record.amountAtomic;
  delete record.amountDisplayUsd;
  const result = evaluateRecord(record, matrix);
  assert.equal(result.ok, false);
  assert.ok(result.codes.includes("missing_amount"));
  assert.equal(naiveVerdict(record), "accept");
});

test("copied settlement on unpaid 402 is forged_settlement", () => {
  const record = cloneValid("unpaid-402-extract-batch-10000-one.json");
  record.settlement = {
    operationId: "agent402-external-validation-purchase-2026-08-29",
    transaction: "0x2916cfe2c5200fca2a21f8b854fe963ef70d4ed90d59c7444cef16dd21056ef7",
  };
  const result = evaluateRecord(record, matrix);
  assert.equal(result.ok, false);
  assert.ok(result.codes.includes("forged_settlement"));
  assert.equal(result.naiveVerdict, "accept");
});

test("GET /extract is not_batch_route", () => {
  const record = cloneValid("unpaid-402-extract-batch-10000-one.json");
  record.method = "GET";
  record.route = "/extract";
  record.resource = matrix.contrast.resource;
  record.request.method = "GET";
  record.request.url = matrix.contrast.resource;
  record.amountAtomic = "5000";
  record.amountDisplayUsd = "0.005";
  delete record.batch;
  const result = evaluateRecord(record, matrix);
  assert.equal(result.ok, false);
  assert.ok(result.codes.includes("not_batch_route"));
});

test("statusClass paid is not_unpaid even without settlement", () => {
  const record = cloneValid("unpaid-402-extract-batch-10000-one.json");
  record.statusClass = "paid";
  const result = evaluateRecord(record, matrix);
  assert.equal(result.ok, false);
  assert.ok(result.codes.includes("not_unpaid"));
  assert.equal(result.naiveVerdict, "reject");
});

test("valid fixtures never carry a payment header, settlement, or live edit", () => {
  for (const filePath of listJsonFiles(VALID_FIXTURES)) {
    const raw = readFileSync(filePath, "utf8");
    assert.doesNotMatch(raw, /"PAYMENT-SIGNATURE"|"X-PAYMENT"|"PAYMENT-RESPONSE"/);
    const record = loadJson(filePath);
    assert.equal(Object.hasOwn(record, "settlement"), false, basename(filePath));
    assert.equal(Object.hasOwn(record, "editLivePrice"), false, basename(filePath));
    assert.equal(Object.hasOwn(record, "proposedAmountAtomic"), false, basename(filePath));
  }
});

test("unknown --seeded-failure is usage exit 2", () => {
  const result = runCli(["--seeded-failure", "stale-listed-amount"]);
  assert.equal(result.status, 2, result.stdout);
  const body = JSON.parse(result.stdout);
  assert.equal(body.error.code, "USAGE");
});

test("evaluateAllSeededFailures catches wrong, missing, and forged", () => {
  const report = evaluateAllSeededFailures(matrix);
  assert.equal(report.caught, true);
  assert.equal(report.error.code, "SEED_REJECT");
  for (const seed of SEEDED_FAILURES) {
    const row = report.seeds.find((item) => item.id === seed);
    assert.equal(row.caught, true, seed);
    assert.ok(designatedSeedPath(seed, matrix).endsWith(`/${matrix.designatedSeeds.find((item) => item.id === seed).file}`));
  }
});

test("lib and CLI stay inside the write boundary and do not pay", () => {
  const lib = readFileSync(join(here, "lib.mjs"), "utf8");
  const cliSrc = readFileSync(cli, "utf8");
  for (const src of [lib, cliSrc]) {
    assert.doesNotMatch(src, /stripe\.(paymentIntents|checkout)/);
    assert.doesNotMatch(src, /\bfetch\(/);
    assert.doesNotMatch(src, /npm publish/);
  }
  assert.match(FIXTURE_ROOT, /batch-extract-402-w7\/fixtures$/);
  assert.equal(PACK_ROOT, here);
  assert.equal(DEFAULT_MATRIX, join(here, "matrix.json"));
  assert.match(ROOT, /samedaydesk|repo$/);
});
