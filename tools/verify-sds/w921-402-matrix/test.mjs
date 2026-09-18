import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  DEFAULT_MATRIX,
  EXTRACT_AMOUNT_ATOMIC,
  FIXTURE_ROOT,
  INVALID_FIXTURES,
  PACK,
  PACK_ROOT,
  ROOT,
  SCAN_AMOUNT_ATOMIC,
  SEEDED_FAILURE,
  TX_RECEIPT_AMOUNT_ATOMIC,
  VALID_FIXTURES,
  atomicToDisplay,
  collectPaidEvidence,
  coverageReport,
  crossCheckInTreeCatalog,
  crossCheckVerifiedFeed,
  designatedSeedPath,
  evaluateRecord,
  evaluateSeededFailure,
  indexRoutes,
  listJsonFiles,
  loadInvalidManifest,
  loadJson,
  loadMatrix,
  naiveVerdict,
  routeKey,
  runCold,
  runSuite,
  validateFile,
  validateRecord,
} from "./lib.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const cli = join(here, "cli.mjs");
const cold = join(here, "cold-run.mjs");
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

test("matrix pin, 23 routes, 8 unique amounts, designated extract-onto-scan seed", () => {
  assert.equal(matrix.pack, PACK);
  assert.equal(matrix.week, "w921");
  assert.equal(matrix.pin.origin, "https://agents.samedaydesk.com");
  assert.equal(matrix.pin.network, "eip155:8453");
  assert.equal(matrix.pin.decimals, 6);
  assert.equal(matrix.routes.length, 23);
  assert.equal(matrix.uniqueAmounts.length, 8);
  assert.equal(matrix.designatedSeed.id, SEEDED_FAILURE);
  assert.equal(matrix.designatedSeed.code, "copy_extract_onto_scan");
  assert.deepEqual(
    matrix.uniqueAmounts.map((item) => item.amountAtomic),
    ["2000", "5000", "10000", "20000", "50000", "100000", "200000", "250000"],
  );
  const extract = matrix.routes.find((row) => row.route === "/extract");
  const scan = matrix.routes.find((row) => row.route === "/scan");
  const tx = matrix.routes.find((row) => row.route === "/chain/transaction-receipt");
  const audit = matrix.routes.find((row) => row.route === "/commerce/seller-integrity-audit");
  assert.equal(extract.amountAtomic, EXTRACT_AMOUNT_ATOMIC);
  assert.equal(extract.amountDisplayUsd, "0.005");
  assert.equal(scan.amountAtomic, SCAN_AMOUNT_ATOMIC);
  assert.equal(tx.amountAtomic, TX_RECEIPT_AMOUNT_ATOMIC);
  assert.equal(audit.amountAtomic, "10000");
  assert.equal(audit.amountDisplayUsd, "0.01");
  assert.equal(atomicToDisplay("5000"), "0.005");
  assert.equal(atomicToDisplay("2000"), "0.002");
  assert.equal(atomicToDisplay("250000"), "0.25");
  assert.equal(atomicToDisplay("200000"), "0.2");
});

test("matrix matches in-tree x402 catalog and verified feed amounts", () => {
  const cross = crossCheckInTreeCatalog(matrix);
  assert.equal(cross.ok, true, JSON.stringify(cross.findings));
  assert.equal(cross.catalogItems, 23);
  assert.equal(cross.matrixRoutes, 23);
  const verified = crossCheckVerifiedFeed(matrix);
  assert.equal(verified.ok, true, JSON.stringify(verified.findings));
  assert.ok(verified.verifiedRoutes >= 20);
});

test("every matrix route has one unpaid fixture covering every unique amount", () => {
  const coverage = coverageReport(matrix);
  assert.equal(coverage.ok, true, JSON.stringify(coverage));
  assert.equal(coverage.validFixtures, 23);
  assert.equal(coverage.missingRoutes.length, 0);
  assert.equal(coverage.missingAmounts.length, 0);
});

test("every valid fixture is accepted as unpaid and matches the matrix amount", () => {
  const files = listJsonFiles(VALID_FIXTURES);
  assert.equal(files.length, 23);
  const routes = indexRoutes(matrix);
  for (const filePath of files) {
    const result = validateFile(filePath, matrix);
    assert.equal(result.ok, true, `${basename(filePath)}: ${JSON.stringify(result.errors)}`);
    assert.equal(result.statusClass, "unpaid");
    assert.equal(result.honestVerdict, "accept");
    const record = loadJson(filePath);
    const row = routes.get(routeKey(record.method, record.route));
    assert.ok(row, basename(filePath));
    assert.equal(record.amountAtomic, row.amountAtomic);
    assert.equal(record.amountDisplayUsd, row.amountDisplayUsd);
    assert.equal(record.charged, false);
    assert.equal(record.paymentSent, false);
    assert.equal(record.httpStatus, 402);
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
    const result = validateFile(join(INVALID_FIXTURES, name), matrix);
    assert.equal(result.ok, false, name);
    assert.ok(
      result.errors.some((item) => item.code === spec.code),
      `${name} missing ${spec.code}: ${JSON.stringify(result.errors)}`,
    );
  }
});

test("suite accepts unpaid fixtures, rejects invalids, and stays on the in-tree catalog", () => {
  const report = runSuite(matrix);
  assert.equal(report.failed, 0, JSON.stringify(report.results.filter((item) => !item.ok)));
  assert.equal(report.passed, 32);
  assert.equal(report.total, 32);
});

test("designated extract-onto-scan seed is naive-accept honest-reject", () => {
  const seed = evaluateSeededFailure(matrix);
  assert.equal(seed.caught, true, JSON.stringify(seed));
  assert.equal(seed.error.code, "SEED_REJECT");
  assert.equal(seed.result.naiveVerdict, "accept");
  assert.equal(seed.result.honestVerdict, "reject");
  assert.ok(seed.result.codes.includes("copy_extract_onto_scan"));
  assert.ok(seed.result.codes.includes("amount_mismatch"));
  const record = loadJson(designatedSeedPath(matrix));
  assert.equal(record.statusClass, "unpaid");
  assert.equal(record.charged, false);
  assert.equal(record.paymentSent, false);
  assert.equal(record.route, "/scan");
  assert.equal(record.amountAtomic, EXTRACT_AMOUNT_ATOMIC);
  assert.equal(naiveVerdict(record), "accept");
  const catalogScan = matrix.routes.find((row) => row.route === "/scan");
  assert.equal(catalogScan.amountAtomic, SCAN_AMOUNT_ATOMIC);
  assert.equal(record.amountAtomic === catalogScan.amountAtomic, false);
});

test("CLI --suite exits 0", () => {
  const result = runCli(["--suite"]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const body = JSON.parse(result.stdout);
  assert.equal(body.ok, true);
  assert.equal(body.failed, 0);
  assert.equal(body.total, 32);
  assert.equal(body.coverage.ok, true);
  assert.equal(body.crossCheck.ok, true);
});

test("CLI --cold and cold-run.mjs exit 0 against in-tree catalog", () => {
  const viaCli = runCli(["--cold"]);
  assert.equal(viaCli.status, 0, viaCli.stderr || viaCli.stdout);
  const body = JSON.parse(viaCli.stdout);
  assert.equal(body.ok, true);
  assert.equal(body.command, "cold");
  assert.equal(body.pins.extract, "5000");
  assert.equal(body.pins.scan, "200000");
  assert.equal(body.pins["transaction-receipt"], "2000");
  assert.equal(body.coldRun.paymentHeadersSent, false);
  assert.equal(body.catalog.ok, true);
  assert.equal(body.verified.ok, true);

  const viaCold = spawnSync(process.execPath, [cold], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 2 * 1024 * 1024,
  });
  assert.equal(viaCold.status, 0, viaCold.stderr || viaCold.stdout);
  const coldBody = JSON.parse(viaCold.stdout);
  assert.equal(coldBody.ok, true);
  assert.equal(coldBody.pins.scan, SCAN_AMOUNT_ATOMIC);

  const libCold = runCold(matrix);
  assert.equal(libCold.ok, true);
});

test("CLI --matrix prints 23 unpaid catalog amounts without network", () => {
  const result = runCli(["--matrix"]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const body = JSON.parse(result.stdout);
  assert.equal(body.ok, true);
  assert.equal(body.routes.length, 23);
  assert.equal(body.pin.payTo, matrix.pin.payTo);
});

test("CLI --seeded-failure extract-onto-scan exits 1 with SEED_REJECT", () => {
  const result = runCli(["--seeded-failure", "extract-onto-scan"]);
  assert.equal(result.status, 1, result.stderr || result.stdout);
  const body = JSON.parse(result.stdout);
  assert.equal(body.ok, false);
  assert.equal(body.seed, "extract-onto-scan");
  assert.equal(body.error.code, "SEED_REJECT");
  assert.match(body.error.message, /seeded extract-onto-scan caught/);
  assert.equal(body.result.naiveVerdict, "accept");
  assert.equal(body.result.honestVerdict, "reject");
  assert.ok(body.result.codes.includes("copy_extract_onto_scan"));
  assert.ok(body.result.codes.includes("amount_mismatch"));
  assert.equal(body.result.caught, true);
  assert.equal(body.result.amountAtomic, "5000");
  assert.equal(body.result.expectedAmountAtomic, "200000");
  assert.equal(body.result.route, "/scan");
});

test("CLI rejects the extract-onto-scan fixture file", () => {
  const file = "tools/verify-sds/w921-402-matrix/fixtures/invalid/extract-onto-scan.json";
  const result = runCli([file]);
  assert.equal(result.status, 1, result.stderr || result.stdout);
  const body = JSON.parse(result.stdout);
  assert.equal(body.ok, false);
  assert.ok(body.results[0].codes.includes("copy_extract_onto_scan"));
});

test("CLI --expect-reject copy_extract_onto_scan on the seed exits 0", () => {
  const file = "tools/verify-sds/w921-402-matrix/fixtures/invalid/extract-onto-scan.json";
  const result = runCli(["--expect-reject", "copy_extract_onto_scan", file]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const body = JSON.parse(result.stdout);
  assert.equal(body.ok, true);
  assert.equal(body.expectReject, "copy_extract_onto_scan");
});

test("CLI --seeded-failure stale-listed-amount exits 1", () => {
  const result = runCli(["--seeded-failure", "stale-listed-amount"]);
  assert.equal(result.status, 1, result.stderr || result.stdout);
  const body = JSON.parse(result.stdout);
  assert.equal(body.ok, false);
  assert.equal(body.error.code, "SEED_REJECT");
  assert.ok(body.result.codes.includes("stale_listed_amount"));
  assert.equal(body.result.amountAtomic, "50000");
});

test("CLI accepts a valid unpaid extract 5000 fixture", () => {
  const file = "tools/verify-sds/w921-402-matrix/fixtures/valid/unpaid-402-extract-5000.json";
  const result = runCli([file]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const body = JSON.parse(result.stdout);
  assert.equal(body.ok, true);
  assert.equal(body.results[0].honestVerdict, "accept");
  assert.equal(body.results[0].amountAtomic, "5000");
});

test("CLI refuses --live, --pay, --payment, --publish, --neo, and --cdp", () => {
  for (const flag of ["--live", "--pay", "--payment", "--checkout", "--publish", "--registry", "--neo", "--cdp"]) {
    const result = runCli([flag, "--cold"]);
    assert.equal(result.status, 2, flag);
    const body = JSON.parse(result.stdout);
    assert.equal(body.error.code, "REFUSED");
  }
});

test("5000 atomic claimed as 5000 dollars is wrong_units", () => {
  const record = cloneValid("unpaid-402-extract-5000.json");
  record.amountDisplayUsd = "5000";
  const result = evaluateRecord(record, matrix);
  assert.equal(result.ok, false);
  assert.ok(result.codes.includes("wrong_units"));
  assert.equal(result.naiveVerdict, "accept");
});

test("numeric or display-unit scan amounts are refused", () => {
  const record = cloneValid("unpaid-402-scan-200000.json");
  record.amountAtomic = "0.20";
  record.amountDisplayUsd = "0.20";
  const display = evaluateRecord(record, matrix);
  assert.equal(display.ok, false);
  assert.ok(display.codes.includes("wrong_units"));
});

test("extract 10000 is amount_mismatch against matrix 5000", () => {
  const record = cloneValid("unpaid-402-extract-5000.json");
  record.amountAtomic = "10000";
  record.amountDisplayUsd = "0.01";
  const result = validateRecord(record, matrix);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((item) => item.code === "amount_mismatch"));
});

test("statusClass paid is not_unpaid even without settlement", () => {
  const record = cloneValid("unpaid-402-extract-5000.json");
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
  const result = runCli(["--seeded-failure", "paid-as-unpaid"]);
  assert.equal(result.status, 2, result.stdout);
  const body = JSON.parse(result.stdout);
  assert.equal(body.error.code, "USAGE");
});

test("lib and CLI stay inside the write boundary and do not pay", () => {
  const lib = readFileSync(join(here, "lib.mjs"), "utf8");
  const cliSrc = readFileSync(cli, "utf8");
  for (const src of [lib, cliSrc]) {
    assert.doesNotMatch(src, /stripe\.(paymentIntents|checkout)/);
    assert.doesNotMatch(src, /\bfetch\(/);
    assert.doesNotMatch(src, /npm publish/);
  }
  assert.match(FIXTURE_ROOT, /w921-402-matrix\/fixtures$/);
  assert.equal(PACK_ROOT, here);
  assert.equal(DEFAULT_MATRIX, join(here, "matrix.json"));
  assert.match(ROOT, /samedaydesk|repo$/);
});
