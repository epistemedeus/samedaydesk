import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { parseArgv } from "../lib/argv.mjs";
import {
  loadCatalog,
  loadCommittedMatrix,
  loadPin,
  unpaidRecordFromRow,
} from "../lib/catalog.mjs";
import { atomicToDisplay } from "../lib/money.mjs";
import { catalogPath, findRepoRoot, loadJson, SLICE_DIR, VALID_FIXTURES } from "../lib/paths.mjs";
import {
  coverageFromRecords,
  evaluateRecord,
  listJsonFiles,
  loadSeededManifest,
  naiveVerdict,
  runSeededSuite,
  validateFile,
  validateRecord,
} from "../lib/validate.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const proveBin = join(here, "../bin/prove.mjs");
const root = findRepoRoot(SLICE_DIR);
const pin = loadPin();
const catalog = loadCatalog(catalogPath(root));
const matrix = loadCommittedMatrix();

function runProve(args) {
  return spawnSync(process.execPath, [proveBin, ...args], {
    encoding: "utf8",
    cwd: root,
    maxBuffer: 2 * 1024 * 1024,
  });
}

function parseStdout(r) {
  const text = String(r.stdout || "").trim();
  assert.ok(text, `empty stdout; stderr=${r.stderr}`);
  return JSON.parse(text);
}

test("map.json is a 402-matrix-only w1021 slice", () => {
  const map = loadJson(join(SLICE_DIR, "map.json"));
  assert.equal(map.feature, "402-matrix");
  assert.equal(map.slice, "w1021-402-matrix-only");
  assert.equal(map.wave, "w1021");
  assert.equal(map.pin.itemCount, 23);
  assert.equal(map.pin.purchaseAuthority, false);
  for (const item of ["publish", "registry", "payment", "checkout", "neomorphic-io", "live-fetch"]) {
    assert.equal(map.outOfScope.includes(item), true, item);
  }
});

test("matrix pin, 23 routes, 8 unique amounts, designated seed", () => {
  assert.equal(matrix.pack, "w1021-402-matrix");
  assert.equal(matrix.wave, "w1021");
  assert.equal(matrix.pin.origin, "https://agents.samedaydesk.com");
  assert.equal(matrix.pin.network, "eip155:8453");
  assert.equal(matrix.pin.decimals, 6);
  assert.equal(matrix.routes.length, 23);
  assert.equal(matrix.uniqueAmounts.length, 8);
  assert.equal(matrix.designatedSeed.id, "stale-listed-amount");
  assert.equal(matrix.designatedSeed.code, "stale_listed_amount");
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

test("committed matrix matches in-tree x402 catalog", () => {
  assert.equal(catalog.lastUpdated, pin.lastUpdated);
  assert.equal(catalog.items.length, 23);
  assert.equal(matrix.inTreeCatalog.lastUpdated, catalog.lastUpdated);
  assert.equal(matrix.routes.length, catalog.items.length);
  for (const item of catalog.items) {
    const route = item.resource.routeTemplate;
    const method = item.request.method;
    const amount = item.accepts[0].amount;
    const row = matrix.routes.find((entry) => entry.method === method && entry.route === route);
    assert.ok(row, `${method} ${route}`);
    assert.equal(row.amountAtomic, amount);
    assert.equal(row.resource, item.resource.url);
  }
});

test("catalog-derived unpaid records cover every route and unique amount", () => {
  const records = matrix.routes.map((row) => unpaidRecordFromRow(row, matrix));
  const coverage = coverageFromRecords(records, matrix);
  assert.equal(coverage.ok, true, JSON.stringify(coverage));
  assert.equal(coverage.records, 23);
  assert.equal(coverage.missingRoutes.length, 0);
  assert.equal(coverage.missingAmounts.length, 0);
  for (const record of records) {
    const result = evaluateRecord(record, matrix);
    assert.equal(result.ok, true, `${record.route}: ${JSON.stringify(result.errors)}`);
    assert.equal(result.honestVerdict, "accept");
    assert.equal(record.httpStatus, 402);
    assert.equal(record.charged, false);
    assert.equal(record.paymentSent, false);
  }
});

test("every seeded fixture is rejected with the declared code", () => {
  const manifest = loadSeededManifest();
  for (const [name, spec] of Object.entries(manifest)) {
    const result = validateFile(join(SLICE_DIR, "fixtures/seeded", name), matrix);
    assert.equal(result.ok, false, name);
    assert.ok(
      result.codes.includes(spec.code),
      `${name} missing ${spec.code}: ${JSON.stringify(result.errors)}`,
    );
  }
});

test("suite accepts committed valid extract and rejects seeded invalids", () => {
  const report = runSeededSuite(matrix);
  assert.equal(report.failed, 0, JSON.stringify(report.results.filter((item) => !item.ok)));
  assert.equal(report.total, 1 + Object.keys(loadSeededManifest()).length);
});

test("designated stale-listed-amount seed is naive-accept honest-reject", () => {
  const file = join(SLICE_DIR, "fixtures/seeded/stale-listed-amount.json");
  const record = loadJson(file);
  const result = evaluateRecord(record, matrix);
  assert.equal(record.statusClass, "unpaid");
  assert.equal(record.charged, false);
  assert.equal(record.paymentSent, false);
  assert.equal(record.route, "/read");
  assert.equal(record.amountAtomic, "50000");
  assert.equal(naiveVerdict(record), "accept");
  assert.equal(result.honestVerdict, "reject");
  assert.ok(result.codes.includes("stale_listed_amount"));
  const catalogRead = matrix.routes.find((row) => row.route === "/read");
  assert.equal(catalogRead.amountAtomic, "5000");
});

test("parseArgv defaults seeded-failure to stale-listed-amount", () => {
  const parsed = parseArgv(["--seeded-failure", "--json"]);
  assert.equal(parsed.seededFailure, true);
  assert.equal(parsed.seededId, "stale-listed-amount");
  assert.equal(parseArgv(["--seeded-failure", "wrong-units"]).seededId, "wrong-units");
  assert.equal(parseArgv(["map"]).command, "map");
  assert.equal(parseArgv(["--live"]).refused, "--live");
});

test("CLI map binds committed catalog without network", () => {
  const r = runProve(["map", "--json"]);
  const body = parseStdout(r);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(body.ok, true);
  assert.equal(body.feature, "402-matrix");
  assert.equal(body.wave, "w1021");
  assert.equal(body.boundary.paymentSent, false);
  assert.equal(body.boundary.live, false);
  assert.equal(body.result.routes, 23);
});

test("dry-run cold does not fetch or pay", () => {
  const r = runProve(["--dry-run", "--json"]);
  const body = parseStdout(r);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(body.ok, true);
  assert.equal(body.dryRun, true);
  assert.ok(Array.isArray(body.result.would));
  assert.match(body.result.would.join("\n"), /no network/);
  assert.equal(body.result.paymentSent, false);
});

test("cold prove binds the real in-tree catalog and 23 unpaid amounts", () => {
  const r = runProve(["--json"]);
  const body = parseStdout(r);
  assert.equal(r.status, 0, `${r.stderr}\n${r.stdout}`);
  assert.equal(body.ok, true);
  assert.equal(body.command, "cold");
  assert.equal(body.feature, "402-matrix");
  assert.equal(body.result.routes, 23);
  assert.equal(body.result.uniqueAmounts.length, 8);
  assert.equal(body.result.coverage.ok, true);
  assert.equal(body.result.extract.amountAtomic, "5000");
  assert.equal(body.result.http402IsSettlement, false);
  assert.equal(body.result.purchaseAuthority, false);
  assert.equal(body.boundary.paymentSent, false);
  assert.equal(body.result.knownStaleListing.listedAmountAtomic, "50000");
  assert.equal(body.result.knownStaleListing.catalogAmountAtomic, "5000");
});

test("CLI --seeded-failure stale-listed-amount exits 1 with SEED_REJECT", () => {
  const r = runProve(["--seeded-failure", "stale-listed-amount", "--json"]);
  const body = parseStdout(r);
  assert.equal(r.status, 1, `${r.status} ${r.stderr} ${r.stdout}`);
  assert.equal(body.ok, false);
  assert.equal(body.command, "seeded-failure");
  assert.equal(body.error.code, "SEED_REJECT");
  assert.equal(body.error.message, "stale-listed-amount");
  assert.equal(body.result.naiveVerdict, "accept");
  assert.equal(body.result.honestVerdict, "reject");
  assert.ok(body.result.codes.includes("stale_listed_amount"));
  assert.equal(body.result.caught, true);
  assert.equal(body.result.amountAtomic, "50000");
  assert.equal(body.result.observedRefuse, true);
});

test("CLI --expect-reject stale_listed_amount on the seed exits 0", () => {
  const file = "tools/verify-sds/w1021-402-matrix/fixtures/seeded/stale-listed-amount.json";
  const r = runProve(["--expect-reject", "stale_listed_amount", file]);
  const body = parseStdout(r);
  assert.equal(r.status, 0, r.stderr || r.stdout);
  assert.equal(body.ok, true);
  assert.equal(body.result.expectReject, "stale_listed_amount");
});

test("CLI accepts the committed unpaid extract 5000 fixture", () => {
  const file = "tools/verify-sds/w1021-402-matrix/fixtures/valid/unpaid-402-extract-5000.json";
  const r = runProve([file]);
  const body = parseStdout(r);
  assert.equal(r.status, 0, r.stderr || r.stdout);
  assert.equal(body.ok, true);
  assert.equal(body.result.results[0].honestVerdict, "accept");
  assert.equal(body.result.results[0].amountAtomic, "5000");
});

test("CLI suite exits 0", () => {
  const r = runProve(["suite", "--json"]);
  const body = parseStdout(r);
  assert.equal(r.status, 0, r.stderr || r.stdout);
  assert.equal(body.ok, true);
  assert.equal(body.result.catalogRoutes, 23);
  assert.equal(body.result.coverage.ok, true);
  assert.equal(body.result.seeded.failed, 0);
});

test("CLI refuses --live, --pay, --payment, --publish, and --neo", () => {
  for (const flag of ["--live", "--pay", "--payment", "--checkout", "--publish", "--registry", "--neo"]) {
    const r = runProve([flag, "--json"]);
    assert.equal(r.status, 2, flag);
    const body = parseStdout(r);
    assert.equal(body.error.code, "REFUSED");
  }
});

test("5000 atomic claimed as 5000 dollars is wrong_units", () => {
  const record = structuredClone(loadJson(join(VALID_FIXTURES, "unpaid-402-extract-5000.json")));
  record.amountDisplayUsd = "5000";
  const result = evaluateRecord(record, matrix);
  assert.equal(result.ok, false);
  assert.ok(result.codes.includes("wrong_units"));
  assert.equal(result.naiveVerdict, "accept");
});

test("extract 10000 is amount_mismatch against matrix 5000", () => {
  const record = structuredClone(loadJson(join(VALID_FIXTURES, "unpaid-402-extract-5000.json")));
  record.amountAtomic = "10000";
  record.amountDisplayUsd = "0.01";
  const result = validateRecord(record, matrix);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((item) => item.code === "amount_mismatch"));
});

test("silent-empty-success is rejected without treating empty ok as coverage", () => {
  const r = runProve(["--seeded-failure", "silent-empty-success", "--json"]);
  const body = parseStdout(r);
  assert.equal(r.status, 1, `${r.status} ${r.stderr} ${r.stdout}`);
  assert.equal(body.ok, false);
  assert.equal(body.error.code, "SEED_REJECT");
  assert.equal(body.error.message, "silent-empty-success");
  assert.equal(body.result.observedRefuse, true);
  assert.deepEqual(body.result.fixture.routes, []);
});

test("unknown command is usage exit 2", () => {
  const r = runProve(["apex-mcp", "--json"]);
  const body = parseStdout(r);
  assert.equal(r.status, 2);
  assert.equal(body.ok, false);
  assert.equal(body.error.code, "USAGE");
});

test("slice write boundary stays under tools/verify-sds/w1021-402-matrix", () => {
  assert.equal(SLICE_DIR.endsWith("tools/verify-sds/w1021-402-matrix"), true);
  const lib = readFileSync(join(SLICE_DIR, "lib/prove.mjs"), "utf8");
  const bin = readFileSync(proveBin, "utf8");
  for (const src of [lib, bin]) {
    assert.doesNotMatch(src, /stripe\.(paymentIntents|checkout)/);
    assert.doesNotMatch(src, /\bfetch\(/);
    assert.doesNotMatch(src, /npm publish/);
  }
  for (const filePath of listJsonFiles(VALID_FIXTURES)) {
    const raw = readFileSync(filePath, "utf8");
    assert.doesNotMatch(raw, /"PAYMENT-SIGNATURE"|"X-PAYMENT"|"PAYMENT-RESPONSE"/);
    assert.equal(basename(filePath).startsWith("unpaid-402-"), true);
  }
  assert.equal(resolve(SLICE_DIR), SLICE_DIR);
});
