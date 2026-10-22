import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  DEFAULT_SCHEMA,
  PINNED_TOOLS_BLOCK_SHA256,
  SCHEMA_VERSION,
  SEEDED_FAILURE,
  WAVE,
  evaluateRecord,
  evaluateSeededFailure,
  findRepoRoot,
  hashFile,
  listJsonFiles,
  loadCatalog,
  loadInvalidManifest,
  loadJson,
  loadSchema,
  pinByBindId,
  readToolsBlockSha,
  refusedFlag,
  runSuite,
  sha256Bytes,
  validateFile,
  VALID_FIXTURES,
  INVALID_FIXTURES,
} from "./lib.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const cli = join(here, "cli.mjs");
const catalog = loadCatalog();
const root = findRepoRoot();

function cloneValid(name) {
  return structuredClone(loadJson(join(VALID_FIXTURES, name)));
}

function runCli(args) {
  return spawnSync(process.execPath, [cli, ...args], { encoding: "utf8" });
}

test("catalog wave, schema, and pins are closed", () => {
  const schema = loadSchema();
  assert.equal(catalog.wave, WAVE);
  assert.equal(catalog.recordSchemaVersion, SCHEMA_VERSION);
  assert.equal(schema.$id.includes("sha-bind-unpaid.w8"), true);
  assert.deepEqual(schema.properties.statusClass.const, "unpaid");
  assert.equal(catalog.pins.length, 10);
  assert.equal(catalog.designatedSeed.id, SEEDED_FAILURE);
  assert.equal(catalog.pin.toolsBlockSha256, PINNED_TOOLS_BLOCK_SHA256);
  assert.equal(catalog.boundary.paymentSent, false);
  assert.equal(catalog.boundary.stripe, false);
});

test("every pin matches committed bytes and a valid fixture", () => {
  const files = listJsonFiles(VALID_FIXTURES);
  assert.equal(files.length, catalog.pins.length);
  const bindIds = files.map((filePath) => loadJson(filePath).bindId).sort();
  assert.deepEqual(bindIds, catalog.pins.map((pin) => pin.bindId).sort());
  for (const pin of catalog.pins) {
    const hashed = hashFile(join(root, pin.path));
    assert.equal(hashed.sha256, pin.sha256, pin.path);
    assert.equal(hashed.bytes, pin.bytes, pin.path);
  }
});

test("every valid fixture is accepted against real artifacts", () => {
  for (const filePath of listJsonFiles(VALID_FIXTURES)) {
    const result = validateFile(filePath, catalog, root);
    assert.equal(result.ok, true, `${basename(filePath)}: ${JSON.stringify(result.errors)}`);
    assert.equal(result.naiveVerdict, "accept");
    assert.equal(result.honestVerdict, "accept");
    assert.equal(result.statusClass, "unpaid");
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
    const result = validateFile(join(INVALID_FIXTURES, name), catalog, root);
    assert.equal(result.ok, false, name);
    assert.ok(
      result.errors.some((item) => item.code === spec.code),
      `${name} missing ${spec.code}: ${JSON.stringify(result.errors)}`,
    );
  }
});

test("suite accepts valid binds and rejects each seeded defect", () => {
  const report = runSuite(catalog, root);
  assert.equal(report.failed, 0, JSON.stringify(report.results.filter((item) => !item.ok)));
  assert.equal(report.passed, 23);
  assert.equal(report.total, 23);
});

test("designated sha-mismatch is naive-accept and honest-reject", () => {
  const seed = evaluateSeededFailure(catalog, root);
  assert.equal(seed.caught, true, JSON.stringify(seed));
  assert.equal(seed.error.code, "SEED_REJECT");
  assert.equal(seed.result.naiveVerdict, "accept");
  assert.equal(seed.result.honestVerdict, "reject");
  assert.ok(seed.result.codes.includes("sha_mismatch"));
});

test("mutating one byte of a valid bind flips the digest", () => {
  const record = cloneValid("extract-402.json");
  const pin = pinByBindId(catalog, record.bindId);
  const hashed = hashFile(join(root, pin.path));
  const mutated = Buffer.from(hashed.buffer);
  mutated[0] = mutated[0] ^ 1;
  assert.notEqual(sha256Bytes(mutated), pin.sha256);
  record.artifact.sha256 = sha256Bytes(mutated);
  const result = evaluateRecord(record, catalog, root);
  assert.equal(result.ok, false);
  assert.ok(result.codes.includes("sha_mismatch"));
});

test("MCP inventory bind cross-checks the frozen tools-block sha", () => {
  assert.equal(readToolsBlockSha(root), PINNED_TOOLS_BLOCK_SHA256);
  const result = validateFile(join(VALID_FIXTURES, "mcp-tool-inventory.json"), catalog, root);
  assert.equal(result.ok, true, JSON.stringify(result.errors));
});

test("schema file is the committed shape contract", () => {
  const schema = JSON.parse(readFileSync(DEFAULT_SCHEMA, "utf8"));
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.wave.const, "w8");
  assert.equal(schema.properties.paymentSent.const, false);
});

test("CLI --cold exits 0 and --seeded-failure sha-mismatch exits 1", () => {
  const cold = runCli(["--cold"]);
  assert.equal(cold.status, 0, cold.stderr + cold.stdout);
  const coldReport = JSON.parse(cold.stdout);
  assert.equal(coldReport.ok, true);
  assert.equal(coldReport.command, "cold");
  assert.equal(coldReport.paid, false);
  assert.equal(coldReport.stripe, false);
  assert.equal(coldReport.passed, 23);

  const seed = runCli(["--seeded-failure", "sha-mismatch"]);
  assert.equal(seed.status, 1, seed.stderr + seed.stdout);
  const seedReport = JSON.parse(seed.stdout);
  assert.equal(seedReport.ok, false);
  assert.equal(seedReport.error.code, "SEED_REJECT");
  assert.equal(seedReport.result.caught, true);
  assert.equal(seedReport.result.naiveVerdict, "accept");
  assert.equal(seedReport.result.honestVerdict, "reject");
  assert.ok(seedReport.result.codes.includes("sha_mismatch"));
});

test("CLI --expect-reject sha_mismatch on the seed file exits 0", () => {
  const reject = runCli([
    "--expect-reject",
    "sha_mismatch",
    join(INVALID_FIXTURES, "sha-mismatch.json"),
  ]);
  assert.equal(reject.status, 0, reject.stderr + reject.stdout);
  assert.equal(JSON.parse(reject.stdout).ok, true);
});

test("CLI --pay and --stripe are refused", () => {
  const pay = runCli(["--pay"]);
  assert.equal(pay.status, 2, pay.stderr + pay.stdout);
  assert.equal(JSON.parse(pay.stdout).error.code, "REFUSED");
  const stripe = runCli(["--stripe"]);
  assert.equal(stripe.status, 2);
  assert.equal(JSON.parse(stripe.stdout).error.code, "REFUSED");
  assert.equal(refusedFlag(["--live"]), "--live");
});

test("CLI accepts a real unpaid bind file", () => {
  const accept = runCli([join(VALID_FIXTURES, "extract-402.json")]);
  assert.equal(accept.status, 0, accept.stderr + accept.stdout);
  const report = JSON.parse(accept.stdout);
  assert.equal(report.ok, true);
  assert.equal(report.results[0].bindId, "sbu_w8_extract_402");
});
