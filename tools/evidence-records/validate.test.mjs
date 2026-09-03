import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";
import {
  defaultSchemaPath,
  invalidFixtureDir,
  listJsonFiles,
  loadCatalog,
  loadInvalidManifest,
  loadJson,
  loadSchema,
  runSuite,
  validFixtureDir,
  validateFile,
  validateRecord,
} from "./lib.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const catalog = loadCatalog();
const schema = loadSchema();

function cloneValid(name) {
  return structuredClone(loadJson(join(validFixtureDir(), name)));
}

test("catalog, schema, and types share the same closed sets", () => {
  const types = readFileSync(join(here, "types/evidence-record.v1.ts"), "utf8");
  const sourceKinds = Object.keys(catalog.sources);
  assert.deepEqual(schema.properties.sourceKind.enum, sourceKinds);
  assert.deepEqual(schema.properties.completeness.enum, catalog.completeness);
  assert.deepEqual(schema.properties.authorityClass.enum, catalog.authorityClasses);
  assert.deepEqual(
    schema.properties.prohibitedInferences.items.enum,
    catalog.prohibitedInferences,
  );
  assert.deepEqual(schema.properties.settlement.properties.buyerClass.enum, catalog.buyerClasses);
  assert.deepEqual(catalog.buyerClasses, ["independent", "owner", "sponsored", "unknown"]);
  for (const kind of sourceKinds) {
    assert.match(types, new RegExp(`"${kind}"`));
  }
  for (const code of catalog.requiredProhibitedInferences) {
    assert.match(types, new RegExp(`"${code}"`));
  }
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.producer.additionalProperties, false);
  assert.equal(schema.properties.scope.additionalProperties, false);
});

test("every source kind has exactly one valid fixture", () => {
  const files = listJsonFiles(validFixtureDir());
  const kinds = files.map((filePath) => loadJson(filePath).sourceKind).sort();
  assert.deepEqual(kinds, Object.keys(catalog.sources).sort());
  assert.equal(new Set(kinds).size, kinds.length);
});

test("every valid fixture is accepted", () => {
  for (const filePath of listJsonFiles(validFixtureDir())) {
    const result = validateFile(filePath, catalog);
    assert.equal(result.ok, true, `${basename(filePath)}: ${JSON.stringify(result.errors)}`);
  }
});

test("every invalid fixture is rejected with the declared code", () => {
  const manifest = loadInvalidManifest();
  const files = listJsonFiles(invalidFixtureDir());
  assert.deepEqual(
    files.map((filePath) => basename(filePath)).sort(),
    Object.keys(manifest).sort(),
  );
  for (const [name, spec] of Object.entries(manifest)) {
    const result = validateFile(join(invalidFixtureDir(), name), catalog);
    assert.equal(result.ok, false, name);
    assert.ok(
      result.errors.some((item) => item.code === spec.code),
      `${name} missing ${spec.code}: ${JSON.stringify(result.errors)}`,
    );
  }
});

test("suite accepts valid fixtures and rejects each prohibited inference", () => {
  const report = runSuite(catalog);
  assert.equal(report.failed, 0, JSON.stringify(report.results.filter((item) => !item.ok)));
  assert.equal(report.passed, 17);
  assert.equal(report.total, 17);
});

test("collapsing two providers in one record is rejected", () => {
  const record = cloneValid("cloudflare-analytics.json");
  record.scope.providerId = "hostinger";
  const result = validateRecord(record, catalog);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((item) => item.code === "collapsed_provider_scope"));
});

test("an untyped extra provider list cannot enter the record", () => {
  const record = cloneValid("cloudflare-analytics.json");
  record.producer.providerIds = ["cloudflare", "hostinger"];
  const result = validateRecord(record, catalog);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((item) => item.code === "additional_property"));
});

test("cross-source join with a declared exact key is accepted", () => {
  const record = cloneValid("cloudflare-analytics.json");
  record.joins = [
    {
      otherSourceKind: "indexnow_receipt",
      exactKey: "ray_id",
      exactValue: "example-ray-not-live",
    },
  ];
  const result = validateRecord(record, catalog);
  assert.equal(result.ok, true, JSON.stringify(result.errors));
});

test("completeness outside the closed set is rejected", () => {
  const record = cloneValid("cloudflare-analytics.json");
  record.completeness = "partial";
  const result = validateRecord(record, catalog);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((item) => item.code === "invalid_completeness"));
});

test("CLI --suite and --expect-reject match the library", () => {
  const suite = spawnSync(process.execPath, [join(here, "validate.mjs"), "--suite"], {
    encoding: "utf8",
  });
  assert.equal(suite.status, 0, suite.stderr);
  const suiteReport = JSON.parse(suite.stdout);
  assert.equal(suiteReport.ok, true);
  assert.equal(suiteReport.passed, 17);
  assert.equal(suiteReport.failed, 0);

  const reject = spawnSync(
    process.execPath,
    [
      join(here, "validate.mjs"),
      "--expect-reject",
      "collapsed_provider_scope",
      join(invalidFixtureDir(), "collapsed-provider-scope.json"),
    ],
    { encoding: "utf8" },
  );
  assert.equal(reject.status, 0, reject.stderr);
  assert.equal(JSON.parse(reject.stdout).ok, true);

  const accept = spawnSync(
    process.execPath,
    [join(here, "validate.mjs"), join(validFixtureDir(), "stripe-event.json")],
    { encoding: "utf8" },
  );
  assert.equal(accept.status, 0, accept.stderr);
  assert.equal(JSON.parse(accept.stdout).ok, true);
});

test("schema file is the committed shape contract", () => {
  assert.equal(defaultSchemaPath().endsWith("schema/evidence-record.v1.json"), true);
  assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.equal(schema.properties.schemaVersion.const, catalog.recordSchemaVersion);
});

test("settlement buyerClass outside the closed set is rejected", () => {
  const record = cloneValid("x402-facilitator-settlement.json");
  record.settlement = {
    operationId: record.recordId,
    amountUsdc: "0.010",
    buyerClass: "revenue",
    validDeliveryStatus: "unknown",
  };
  const result = validateRecord(record, catalog);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((item) => item.code === "invalid_buyer_class"));
});
