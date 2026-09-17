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
  SEEDED_FAILURE,
  SEEDED_FAILURE_IDS,
  VALID_FIXTURES,
  WAVE,
  atomicToDisplay,
  collectPaidEvidence,
  coverageReport,
  crossCheckInTreeCatalog,
  designatedSeedPath,
  designatedSeeds,
  evaluateRecord,
  evaluateSeededFailure,
  indexRoutes,
  listJsonFiles,
  loadInvalidManifest,
  loadJson,
  loadMatrix,
  naiveVerdict,
  routeKey,
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

test("matrix pin, 23 routes, 8 unique amounts, designated seeds", () => {
  assert.equal(matrix.pack, PACK);
  assert.equal(matrix.wave, WAVE);
  assert.equal(matrix.pin.origin, "https://agents.samedaydesk.com");
  assert.equal(matrix.pin.network, "eip155:8453");
  assert.equal(matrix.pin.decimals, 6);
  assert.equal(matrix.routes.length, 23);
  assert.equal(matrix.uniqueAmounts.length, 8);
  assert.equal(matrix.designatedSeed.id, SEEDED_FAILURE);
  assert.equal(matrix.designatedSeed.code, "stale_listed_amount");
  assert.deepEqual(
    designatedSeeds(matrix).map((item) => item.id),
    SEEDED_FAILURE_IDS,
  );
  assert.deepEqual(
    matrix.uniqueAmounts.map((item) => item.amountAtomic),
    ["2000", "5000", "10000", "20000", "50000", "100000", "200000", "250000"],
  );
  const extract = matrix.routes.find((row) => row.route === "/extract");
  const audit = matrix.routes.find((row) => row.route === "/commerce/seller-integrity-audit");
  assert.equal(extract.amountAtomic, "5000");
  assert.equal(extract.amountDisplayUsd, "0.005");
  assert.equal(audit.amountAtomic, "10000");
  assert.equal(audit.amountDisplayUsd, "0.01");
  assert.equal(atomicToDisplay("5000"), "0.005");
  assert.equal(atomicToDisplay("2000"), "0.002");
  assert.equal(atomicToDisplay("250000"), "0.25");
});

test("matrix matches in-tree x402 catalog", () => {
  const cross = crossCheckInTreeCatalog(matrix);
  assert.equal(cross.ok, true, JSON.stringify(cross.findings));
  assert.equal(cross.catalogItems, 23);
  assert.equal(cross.matrixRoutes, 23);
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

test("designated seeds are naive-accept honest-reject", () => {
  const all = evaluateSeededFailure("all", matrix);
  assert.equal(all.caught, true, JSON.stringify(all));
  assert.equal(all.error.code, "SEED_REJECT");
  assert.equal(all.results.length, 3);

  const amount = evaluateSeededFailure("bad-amount", matrix);
  assert.equal(amount.caught, true, JSON.stringify(amount));
  assert.equal(amount.error.code, "SEED_REJECT");
  assert.ok(amount.result.codes.includes("stale_listed_amount"));
  const amountRecord = loadJson(designatedSeedPath(matrix, designatedSeeds(matrix)[0]));
  assert.equal(amountRecord.statusClass, "unpaid");
  assert.equal(amountRecord.charged, false);
  assert.equal(amountRecord.paymentSent, false);
  assert.equal(amountRecord.route, "/read");
  assert.equal(amountRecord.amountAtomic, "50000");
  assert.equal(naiveVerdict(amountRecord), "accept");
  const catalogRead = matrix.routes.find((row) => row.route === "/read");
  assert.equal(catalogRead.amountAtomic, "5000");

  const status = evaluateSeededFailure("bad-status", matrix);
  assert.equal(status.caught, true, JSON.stringify(status));
  assert.ok(status.result.codes.includes("bad_status"));
  assert.equal(status.result.naiveVerdict, "accept");
  assert.equal(status.result.honestVerdict, "reject");

  const forged = evaluateSeededFailure("forged-settle", matrix);
  assert.equal(forged.caught, true, JSON.stringify(forged));
  assert.ok(forged.result.codes.includes("forged_settle"));
  assert.equal(forged.result.naiveVerdict, "accept");
  assert.equal(forged.result.honestVerdict, "reject");
});

test("CLI --cold exits 0", () => {
  const result = runCli(["--cold"]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const body = JSON.parse(result.stdout);
  assert.equal(body.ok, true);
  assert.equal(body.command, "cold");
  assert.equal(body.failed, 0);
  assert.equal(body.total, 32);
  assert.equal(body.coverage.ok, true);
  assert.equal(body.crossCheck.ok, true);
  assert.equal(body.boundary.paymentSent, false);
  assert.equal(body.boundary.live, false);
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

test("CLI --matrix prints 23 unpaid catalog amounts without network", () => {
  const result = runCli(["--matrix"]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const body = JSON.parse(result.stdout);
  assert.equal(body.ok, true);
  assert.equal(body.routes.length, 23);
  assert.equal(body.pin.payTo, matrix.pin.payTo);
});

test("CLI --seeded-failure all exits 1 with SEED_REJECT", () => {
  const result = runCli(["--seeded-failure", "all"]);
  assert.equal(result.status, 1, result.stderr || result.stdout);
  const body = JSON.parse(result.stdout);
  assert.equal(body.ok, false);
  assert.equal(body.seed, "all");
  assert.equal(body.error.code, "SEED_REJECT");
  assert.match(body.error.message, /bad amount, bad status, and forged settle/);
  assert.equal(body.result.length, 3);
  const bySeed = Object.fromEntries(body.result.map((item) => [item.seed, item]));
  assert.equal(bySeed["bad-amount"].caught, true);
  assert.ok(bySeed["bad-amount"].codes.includes("stale_listed_amount"));
  assert.equal(bySeed["bad-status"].caught, true);
  assert.ok(bySeed["bad-status"].codes.includes("bad_status"));
  assert.equal(bySeed["forged-settle"].caught, true);
  assert.ok(bySeed["forged-settle"].codes.includes("forged_settle"));
});

test("CLI --seeded-failure bad-amount exits 1 with stale_listed_amount", () => {
  const result = runCli(["--seeded-failure", "bad-amount"]);
  assert.equal(result.status, 1, result.stderr || result.stdout);
  const body = JSON.parse(result.stdout);
  assert.equal(body.ok, false);
  assert.equal(body.seed, "bad-amount");
  assert.equal(body.error.code, "SEED_REJECT");
  assert.equal(body.result.naiveVerdict, "accept");
  assert.equal(body.result.honestVerdict, "reject");
  assert.ok(body.result.codes.includes("stale_listed_amount"));
  assert.equal(body.result.caught, true);
  assert.equal(body.result.amountAtomic, "50000");
});

test("CLI --seeded-failure bad-status exits 1 with bad_status", () => {
  const result = runCli(["--seeded-failure", "bad-status"]);
  assert.equal(result.status, 1, result.stderr || result.stdout);
  const body = JSON.parse(result.stdout);
  assert.equal(body.ok, false);
  assert.equal(body.error.code, "SEED_REJECT");
  assert.ok(body.result.codes.includes("bad_status"));
  assert.equal(body.result.naiveVerdict, "accept");
  assert.equal(body.result.honestVerdict, "reject");
});

test("CLI --seeded-failure forged-settle exits 1 with forged_settle", () => {
  const result = runCli(["--seeded-failure", "forged-settle"]);
  assert.equal(result.status, 1, result.stderr || result.stdout);
  const body = JSON.parse(result.stdout);
  assert.equal(body.ok, false);
  assert.equal(body.error.code, "SEED_REJECT");
  assert.ok(body.result.codes.includes("forged_settle"));
  assert.equal(body.result.naiveVerdict, "accept");
  assert.equal(body.result.honestVerdict, "reject");
});

test("CLI rejects the three designated seed fixture files", () => {
  const cases = [
    ["stale_listed_amount", "tools/verify-sds/w821-402-matrix/fixtures/invalid/stale-listed-amount.json"],
    ["bad_status", "tools/verify-sds/w821-402-matrix/fixtures/invalid/http-200-as-unpaid.json"],
    ["forged_settle", "tools/verify-sds/w821-402-matrix/fixtures/invalid/forged-settle.json"],
  ];
  for (const [code, file] of cases) {
    const result = runCli([file]);
    assert.equal(result.status, 1, `${file} ${result.stderr || result.stdout}`);
    const body = JSON.parse(result.stdout);
    assert.equal(body.ok, false);
    assert.ok(body.results[0].codes.includes(code), `${file} ${JSON.stringify(body.results[0].codes)}`);
  }
});

test("CLI --expect-reject on designated seeds exits 0", () => {
  const cases = [
    ["stale_listed_amount", "tools/verify-sds/w821-402-matrix/fixtures/invalid/stale-listed-amount.json"],
    ["bad_status", "tools/verify-sds/w821-402-matrix/fixtures/invalid/http-200-as-unpaid.json"],
    ["forged_settle", "tools/verify-sds/w821-402-matrix/fixtures/invalid/forged-settle.json"],
  ];
  for (const [code, file] of cases) {
    const result = runCli(["--expect-reject", code, file]);
    assert.equal(result.status, 0, `${file} ${result.stderr || result.stdout}`);
    const body = JSON.parse(result.stdout);
    assert.equal(body.ok, true);
    assert.equal(body.expectReject, code);
  }
});

test("CLI accepts a valid unpaid extract 5000 fixture", () => {
  const file = "tools/verify-sds/w821-402-matrix/fixtures/valid/unpaid-402-extract-5000.json";
  const result = runCli([file]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const body = JSON.parse(result.stdout);
  assert.equal(body.ok, true);
  assert.equal(body.results[0].honestVerdict, "accept");
  assert.equal(body.results[0].amountAtomic, "5000");
});

test("CLI refuses --live, --pay, --payment, --publish, --settle, and --neo", () => {
  for (const flag of ["--live", "--pay", "--payment", "--checkout", "--publish", "--registry", "--settle", "--neo"]) {
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

test("HTTP 200 labeled unpaid is bad_status", () => {
  const record = cloneValid("unpaid-402-extract-5000.json");
  record.httpStatus = 200;
  const result = evaluateRecord(record, matrix);
  assert.equal(result.ok, false);
  assert.ok(result.codes.includes("bad_status"));
  assert.equal(result.naiveVerdict, "accept");
});

test("copied settlement on unpaid 402 is forged_settle", () => {
  const record = cloneValid("unpaid-402-extract-5000.json");
  record.settlement = {
    operationId: "forged",
    amountUsdc: "0.010",
    transaction: "0x2916cfe2c5200fca2a21f8b854fe963ef70d4ed90d59c7444cef16dd21056ef7",
  };
  const result = evaluateRecord(record, matrix);
  assert.equal(result.ok, false);
  assert.ok(result.codes.includes("forged_settle"));
  assert.equal(result.naiveVerdict, "accept");
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
  const result = runCli(["--seeded-failure", "does-not-exist"]);
  assert.equal(result.status, 2, result.stdout);
  const body = JSON.parse(result.stdout);
  assert.equal(body.error.code, "USAGE");
});

test("stale-listed-amount alias maps to bad-amount", () => {
  const result = runCli(["--seeded-failure", "stale-listed-amount"]);
  assert.equal(result.status, 1, result.stderr || result.stdout);
  const body = JSON.parse(result.stdout);
  assert.equal(body.error.code, "SEED_REJECT");
  assert.ok(body.result.codes.includes("stale_listed_amount"));
});

test("lib and CLI stay inside the write boundary and do not pay", () => {
  const lib = readFileSync(join(here, "lib.mjs"), "utf8");
  const cliSrc = readFileSync(cli, "utf8");
  for (const src of [lib, cliSrc]) {
    assert.doesNotMatch(src, /stripe\.(paymentIntents|checkout)/);
    assert.doesNotMatch(src, /\bfetch\(/);
    assert.doesNotMatch(src, /npm publish/);
  }
  assert.match(FIXTURE_ROOT, /w821-402-matrix\/fixtures$/);
  assert.equal(PACK_ROOT, here);
  assert.equal(DEFAULT_MATRIX, join(here, "matrix.json"));
  assert.match(ROOT, /samedaydesk|repo$/);
});
