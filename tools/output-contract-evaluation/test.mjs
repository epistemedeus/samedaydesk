import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  ROOT,
  detectKind,
  evaluateDocument,
  evaluateFile,
  evaluateOutputContract,
  evaluateSdsConsumerEvidence,
  invalidFixtureDir,
  listJsonFiles,
  loadCatalog,
  loadInvalidManifest,
  loadJson,
  runSuite,
  validFixtureDir,
} from "./lib.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const cli = join(here, "cli.mjs");
const catalog = loadCatalog();

function runCli(args) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
}

function sourceFiles() {
  return ["lib.mjs", "cli.mjs"].map((name) => readFileSync(join(here, name), "utf8"));
}

test("closed catalog sets are non-empty and catalog-only", () => {
  assert.equal(catalog.schemaVersion, "samedaydesk.output-contract-evaluation.catalog.v1");
  assert.equal(catalog.mode, "catalog-only");
  assert.deepEqual(catalog.catalogEligibleCompleteness, ["complete"]);
  assert.ok(catalog.rejectCodes.includes("unconstrained_object"));
  assert.ok(catalog.rejectCodes.includes("catalog_only_violation"));
  assert.ok(catalog.prohibitedInferences.includes("observation_is_catalog_declaration"));
  assert.equal(catalog.consumerEvidence.openapi, "fixtures/presence/catalog/openapi.json");
});

test("tool sources never fetch, pay, publish, or name neomorphic.io", () => {
  for (const source of sourceFiles()) {
    assert.equal(/\bfetch\s*\(/.test(source), false);
    assert.equal(/neomorphic\.io/i.test(source), false);
    assert.equal(/stripe/i.test(source), false);
    assert.equal(/PAYMENT-SIGNATURE/.test(source), false);
  }
});

test("complete typed schema is catalog-eligible", () => {
  const result = evaluateOutputContract({
    mediaType: "application/json",
    schema: {
      type: "object",
      required: ["ok", "title"],
      properties: {
        ok: { type: "boolean" },
        title: { type: "string" },
      },
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.catalogEligible, true);
  assert.equal(result.completeness, "complete");
  assert.deepEqual(result.requiredPaths, ["ok", "title"]);
});

test("unconstrained object and example-only contracts are rejected", () => {
  const unconstrained = evaluateOutputContract({
    mediaType: "application/json",
    schema: { type: "object" },
  });
  assert.equal(unconstrained.ok, false);
  assert.equal(unconstrained.completeness, "unconstrained");
  assert.ok(unconstrained.errors.some((item) => item.code === "unconstrained_object"));

  const exampleOnly = evaluateOutputContract({
    mediaType: "application/json",
    example: { ok: true, title: "x" },
  });
  assert.equal(exampleOnly.ok, false);
  assert.equal(exampleOnly.completeness, "example_only");
  assert.ok(exampleOnly.errors.some((item) => item.code === "example_is_not_schema"));
});

test("checkout and registry publish cannot stand in for an output contract", () => {
  const checkout = evaluateDocument({
    kind: "single_route",
    method: "GET",
    path: "/extract",
    mediaType: "application/json",
    schema: { type: "object", required: ["ok"], properties: { ok: { type: "boolean" } } },
    checkout: { session: "cs_test" },
  });
  assert.equal(checkout.ok, false);
  assert.equal(checkout.completeness, "out_of_scope");
  assert.ok(checkout.errors.some((item) => item.code === "catalog_only_violation"));

  const publish = evaluateDocument({
    kind: "single_route",
    method: "GET",
    path: "/extract",
    mediaType: "application/json",
    schema: { type: "object", required: ["ok"], properties: { ok: { type: "boolean" } } },
    registryPublish: true,
  });
  assert.equal(publish.ok, false);
  assert.ok(publish.errors.some((item) => item.code === "catalog_only_violation"));
});

test("suite accepts valid fixtures and rejects each seeded failure code", () => {
  const report = runSuite(catalog);
  assert.equal(report.failed, 0, JSON.stringify(report.results.filter((item) => !item.ok), null, 2));
  const manifest = loadInvalidManifest();
  const invalidFiles = listJsonFiles(invalidFixtureDir());
  const validFiles = listJsonFiles(validFixtureDir());
  assert.equal(Object.keys(manifest).length, invalidFiles.length);
  assert.equal(report.total, validFiles.length + invalidFiles.length);
});

test("CLI --suite and --expect-reject match the library", () => {
  const suite = runCli(["--suite"]);
  assert.equal(suite.status, 0, suite.stderr);
  const suiteReport = JSON.parse(suite.stdout);
  assert.equal(suiteReport.ok, true);
  assert.equal(suiteReport.failed, 0);

  const reject = runCli([
    "--expect-reject",
    "unconstrained_object",
    "tools/output-contract-evaluation/fixtures/invalid/unconstrained-object.json",
  ]);
  assert.equal(reject.status, 0, reject.stderr);
  const rejectReport = JSON.parse(reject.stdout);
  assert.equal(rejectReport.ok, true);
  assert.equal(rejectReport.expectReject, "unconstrained_object");
  assert.ok(rejectReport.codes.includes("unconstrained_object"));
});

test("cold consumer evaluation reads SDS catalog evidence and does not fetch", () => {
  const report = evaluateSdsConsumerEvidence(catalog);
  assert.equal(report.ok, true);
  assert.equal(report.mode, "catalog-only");
  assert.equal(report.fetched, false);
  assert.equal(report.paid, false);
  assert.equal(report.registryWrite, false);
  assert.equal(report.catalogEligible, false);
  assert.equal(report.originCatalog.openapiVersion, "1.23.40");
  assert.equal(report.originCatalog.paidOperations, 25);
  assert.equal(report.originCatalog.x402Items, 23);
  assert.equal(report.originCatalog.summary.catalogEligible, 0);
  assert.equal(report.originCatalog.summary.completeness.empty_success, 2);
  assert.equal(report.originCatalog.summary.completeness.input_only, 23);
  assert.equal(report.bazaarListings.resourceCount, 10);
  assert.equal(report.bazaarListings.catalogEligible, false);
  assert.equal(report.consumerObservations.completeness, "observation_only");
  assert.equal(report.consumerObservations.unpaid402OutputSchemaPresent, 20);
  assert.deepEqual(report.buyerRuntimePin.guaranteedPaths, ["ok", "title", "url"]);
  assert.equal(report.usefulJobsCatalog.jobs, 10);
  assert.equal(report.usefulJobsCatalog.withNamedOutputs, 10);
  assert.equal(report.usefulJobsCatalog.purchaseAuthority, false);
  assert.equal(report.sources.length >= 6, true);
  assert.equal(
    report.originCatalog.routes.every((row) => row.catalogEligible === false),
    true,
  );
});

test("CLI cold run evaluates committed SDS consumer evidence", () => {
  const result = runCli(["--pretty"]);
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.ok, true);
  assert.equal(report.catalogEligible, false);
  assert.equal(report.originCatalog.openapiVersion, "1.23.40");
  assert.equal(report.fetched, false);
});

test("real SDS OpenAPI extract is rejected as a complete catalog output contract", () => {
  const result = runCli(["--file", "fixtures/presence/catalog/openapi.json"]);
  assert.equal(result.status, 1, result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.ok, false);
  assert.equal(report.catalogEligible, false);
  assert.ok(report.codes.includes("empty_openapi_success"));
  assert.equal(detectKind(loadJson(join(ROOT, "fixtures/presence/catalog/openapi.json"))), "openapi");
});

test("valid fixture files are accepted by --file", () => {
  const result = runCli([
    "--file",
    "tools/output-contract-evaluation/fixtures/valid/complete-single-route.json",
  ]);
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.ok, true);
  assert.equal(report.catalogEligible, true);
  assert.equal(report.completeness, "complete");
});

test("seeded payment-checkout fixture is rejected", () => {
  const result = evaluateFile(join(invalidFixtureDir(), "payment-checkout.json"), catalog);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((item) => item.code === "catalog_only_violation"));
});

test("schema property names and example payload keys are not catalog-only violations", () => {
  const named = evaluateFile(join(validFixtureDir(), "schema-property-named-checkout.json"), catalog);
  assert.equal(named.ok, true, JSON.stringify(named.errors, null, 2));
  assert.equal(named.catalogEligible, true);
  assert.equal(named.completeness, "complete");
  assert.equal(
    named.errors.some((item) => item.code === "catalog_only_violation"),
    false,
  );

  const namedCli = runCli([
    "--file",
    "tools/output-contract-evaluation/fixtures/valid/schema-property-named-checkout.json",
  ]);
  assert.equal(namedCli.status, 0, namedCli.stderr);
  const report = JSON.parse(namedCli.stdout);
  assert.equal(report.ok, true);
  assert.equal(report.catalogEligible, true);
});

test("capitalized Checkout envelope is still a catalog-only violation", () => {
  const result = runCli([
    "--expect-reject",
    "catalog_only_violation",
    "tools/output-contract-evaluation/fixtures/invalid/capitalized-checkout.json",
  ]);
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.ok, true);
  assert.equal(report.catalogEligible, false);
  assert.ok(report.codes.includes("catalog_only_violation"));
});

test("OpenAPI prefers application/json over alphabetically earlier */*", () => {
  const result = runCli([
    "--file",
    "tools/output-contract-evaluation/fixtures/valid/openapi-wildcard-and-json.json",
  ]);
  assert.equal(result.status, 0, result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.ok, true);
  assert.equal(report.catalogEligible, true);
  assert.equal(report.completeness, "complete");
  assert.equal(report.codes.includes("media_type_missing"), false);
  assert.equal(report.codes.includes("unconstrained_object"), false);
});

test("non-object schemas are invalid_shape, not unconstrained objects", () => {
  const result = runCli([
    "--expect-reject",
    "invalid_shape",
    "tools/output-contract-evaluation/fixtures/invalid/non-object-schema.json",
  ]);
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.ok, true);
  assert.equal(report.completeness, "absent");
  assert.equal(report.catalogEligible, false);
  assert.equal(report.codes.includes("unconstrained_object"), false);

  const combinator = evaluateOutputContract({
    mediaType: "application/json",
    schema: {
      anyOf: [{ type: "object", required: ["ok"], properties: { ok: { type: "boolean" } } }],
    },
  });
  assert.equal(combinator.ok, false);
  assert.equal(combinator.catalogEligible, false);
  assert.ok(combinator.errors.some((item) => item.code === "invalid_shape"));
  assert.equal(
    combinator.errors.some((item) => item.code === "unconstrained_object"),
    false,
  );
});

test("missing consumer evidence is JSON-rejected, not an uncaught throw", () => {
  const broken = {
    ...catalog,
    consumerEvidence: { ...catalog.consumerEvidence, openapi: "no-such-openapi.json" },
  };
  const report = evaluateSdsConsumerEvidence(broken);
  assert.equal(report.ok, false);
  assert.equal(report.fetched, false);
  assert.equal(report.paid, false);
  assert.equal(report.registryWrite, false);
  assert.equal(report.catalogEligible, false);
  assert.ok(report.errors.some((item) => item.code === "consumer_evidence_missing"));
});

test("top-level checkout still cannot stand in for an output contract", () => {
  const result = runCli([
    "--expect-reject",
    "catalog_only_violation",
    "tools/output-contract-evaluation/fixtures/invalid/payment-checkout.json",
  ]);
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.ok, true);
  assert.ok(report.codes.includes("catalog_only_violation"));
});

test("OpenAPI and x402 join only on exact METHOD path", () => {
  const report = evaluateSdsConsumerEvidence(catalog);
  const extract = report.originCatalog.routes.find((row) => row.id === "GET /extract");
  const postPreflight = report.originCatalog.routes.find((row) => row.id === "POST /work/opportunity-preflight");
  assert.equal(extract.exactJoin, true);
  assert.equal(extract.x402Completeness, "input_only");
  assert.equal(extract.openapiCompleteness, "empty_success");
  assert.equal(postPreflight.exactJoin, false);
  assert.equal(postPreflight.openapiCompleteness, "empty_success");
  assert.equal(postPreflight.x402Completeness, "absent");
});
