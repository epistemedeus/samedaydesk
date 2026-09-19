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
  REFUSED_FLAGS,
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
  assert.equal(schema.properties.statusClass.type, "string");
  assert.equal(schema.properties.charged.type, "boolean");
  assert.equal(schema.properties.paymentSent.type, "boolean");
  assert.equal(schema.properties.statusClass.const, undefined);
  assert.equal(schema.properties.charged.const, undefined);
  assert.equal(schema.properties.paymentSent.const, undefined);
  assert.equal(schema.properties.resource.maxLength, 2048);
  assert.equal(schema.properties.request.properties.url.maxLength, 2048);
  assert.equal(schema.properties.joinKeys.minItems, 4);
  assert.equal(schema.properties.joinKeys.maxItems, 16);
  assert.equal(schema.properties.joinKeys.uniqueItems, true);
  assert.equal(schema.properties.unknownWhenAbsent.minItems, 1);
  assert.equal(schema.properties.prohibitedInferences.minItems, 4);
  assert.equal(schema.additionalProperties, false);
  assert.equal(catalog.designatedSeed.id, SEEDED_FAILURE);
  assert.equal(catalog.designatedSeed.code, "paid_as_unpaid");
  assert.equal(catalog.pack, "unpaid-only");
  assert.equal(catalog.pin.origin, "https://agents.samedaydesk.com");
  assert.equal(catalog.boundary.write, "tools/commerce-receipts/**");
  assert.equal(catalog.boundary.paymentSent, false);
  assert.equal(catalog.boundary.published, false);
  assert.equal(catalog.boundary.neoKernelVendor, false);
});

test("catalog pin matches in-tree x402 extract accept", () => {
  const x402 = loadJson(join(ROOT, "fixtures/presence/catalog/x402.json"));
  const extract = x402.items.find((item) => item.resource.routeTemplate === "/extract");
  assert.ok(extract, "in-tree x402 catalog missing /extract");
  const accept = extract.accepts[0];
  assert.equal(accept.scheme, catalog.pin.scheme);
  assert.equal(accept.network, catalog.pin.network);
  assert.equal(accept.payTo, catalog.pin.payTo);
  assert.equal(accept.asset, catalog.pin.asset);
  assert.equal(accept.amount, "5000");
});

test("gateway unpaid fixture resource matches in-tree x402 OpenAPI example url", () => {
  const x402 = loadJson(join(ROOT, "fixtures/presence/catalog/x402.json"));
  const gateway = x402.items.find(
    (item) => item.resource.routeTemplate === "/gateway/commerce/payment-offer-preflight",
  );
  assert.ok(gateway, "in-tree x402 catalog missing gateway payment-offer-preflight");
  const record = loadJson(join(VALID_FIXTURES, "unpaid-402-gateway-payment-offer-preflight.json"));
  assert.equal(record.resource, gateway.resource.url);
  assert.equal(record.request.url, gateway.resource.url);
});

test("extract unpaid fixtures match in-tree x402 catalog example url", () => {
  const x402 = loadJson(join(ROOT, "fixtures/presence/catalog/x402.json"));
  const extract = x402.items.find((item) => item.resource.routeTemplate === "/extract");
  assert.ok(extract, "in-tree x402 catalog missing /extract");
  const names = [
    "unpaid-402-extract.json",
    "unpaid-buyer-runtime-stop.json",
    "unpaid-offer-receipt-extract.json",
  ];
  for (const name of names) {
    const record = loadJson(join(VALID_FIXTURES, name));
    assert.equal(record.resource, extract.resource.url, name);
    assert.equal(record.request.url, extract.resource.url, name);
  }
  const offer = loadJson(join(VALID_FIXTURES, "unpaid-offer-receipt-extract.json"));
  assert.equal(offer.offerReceipt.offers[0].payload.resourceUrl, extract.resource.url);
});

test("valid fixture amounts match in-tree x402 catalog for the same route", () => {
  const x402 = loadJson(join(ROOT, "fixtures/presence/catalog/x402.json"));
  const byRoute = new Map(
    x402.items.map((item) => [item.resource.routeTemplate, item.accepts[0].amount]),
  );
  for (const filePath of listJsonFiles(VALID_FIXTURES)) {
    const record = loadJson(filePath);
    const amount = byRoute.get(record.route);
    assert.ok(amount, `${basename(filePath)} missing x402 amount for ${record.route}`);
    assert.equal(record.accepts[0].amount, amount, basename(filePath));
  }
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
  assert.equal(body.paid, false);
  assert.equal(body.live, false);
});

test("CLI --cold exits 0 (offline, unpaid)", () => {
  const result = runCli(["--cold"]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const body = JSON.parse(result.stdout);
  assert.equal(body.ok, true);
  assert.equal(body.command, "cold");
  assert.equal(body.paid, false);
  assert.equal(body.live, false);
  assert.equal(body.network, false);
  assert.equal(body.neo, false);
  assert.equal(body.published, false);
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
  const file = "tools/commerce-receipts/fixtures/invalid/paid-as-unpaid.json";
  const result = runCli([file]);
  assert.equal(result.status, 1, result.stderr || result.stdout);
  const body = JSON.parse(result.stdout);
  assert.equal(body.ok, false);
  assert.ok(body.results[0].codes.includes("paid_as_unpaid"));
});

test("CLI --expect-reject paid_as_unpaid on the seed exits 0", () => {
  const file = "tools/commerce-receipts/fixtures/invalid/paid-as-unpaid.json";
  const result = runCli(["--expect-reject", "paid_as_unpaid", file]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const body = JSON.parse(result.stdout);
  assert.equal(body.ok, true);
  assert.equal(body.expectReject, "paid_as_unpaid");
});

test("CLI accepts a valid unpaid 402 fixture", () => {
  const file = "tools/commerce-receipts/fixtures/valid/unpaid-402-extract.json";
  const result = runCli([file]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const body = JSON.parse(result.stdout);
  assert.equal(body.ok, true);
  assert.equal(body.results[0].honestVerdict, "accept");
});

test("CLI refuses --live, --pay, --publish, and --neo", () => {
  for (const flag of [
    "--live",
    "--pay",
    "--payment",
    "--checkout",
    "--publish",
    "--registry",
    "--refresh",
    "--settle",
    "--neo",
    "--neo-kernel-vendor",
    "--live=true",
    "--pay=now",
    "--neo-kernel-vendor=1",
  ]) {
    const result = runCli([flag, "--cold"]);
    assert.equal(result.status, 2, flag);
    const body = JSON.parse(result.stdout);
    assert.equal(body.error.code, "REFUSED", flag);
  }
});

test("CLI unknown flag and missing --seeded-failure value are USAGE exit 2", () => {
  const unknown = runCli(["--foo"]);
  assert.equal(unknown.status, 2, unknown.stderr || unknown.stdout);
  assert.equal(JSON.parse(unknown.stdout).error.code, "USAGE");
  const missing = runCli(["--seeded-failure"]);
  assert.equal(missing.status, 2, missing.stderr || missing.stdout);
  assert.equal(JSON.parse(missing.stdout).error.code, "USAGE");
});

test("CLI missing command and mixed --cold args are JSON USAGE exit 2", () => {
  const none = runCli([]);
  assert.equal(none.status, 2, none.stderr || none.stdout);
  assert.equal(JSON.parse(none.stdout).error.code, "USAGE");
  const mixed = runCli(["--cold", "tools/commerce-receipts/fixtures/valid/unpaid-402-extract.json"]);
  assert.equal(mixed.status, 2, mixed.stderr || mixed.stdout);
  assert.equal(JSON.parse(mixed.stdout).error.code, "USAGE");
  const seededExtra = runCli([
    "--seeded-failure",
    "paid-as-unpaid",
    "tools/commerce-receipts/fixtures/invalid/paid-as-unpaid.json",
  ]);
  assert.equal(seededExtra.status, 2, seededExtra.stderr || seededExtra.stdout);
  assert.equal(JSON.parse(seededExtra.stdout).error.code, "USAGE");
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

test("X-PAYMENT-RESPONSE and padded payment header names are paid_as_unpaid", () => {
  const responseHeader = cloneValid("unpaid-402-extract.json");
  responseHeader.request.headers["X-PAYMENT-RESPONSE"] = "seeded";
  const responseResult = validateRecord(responseHeader, catalog);
  assert.equal(responseResult.ok, false);
  assert.ok(responseResult.errors.some((item) => item.code === "paid_as_unpaid"));

  const padded = cloneValid("unpaid-402-extract.json");
  padded.request.headers[" X-PAYMENT "] = "seeded";
  const paddedResult = validateRecord(padded, catalog);
  assert.equal(paddedResult.ok, false);
  assert.ok(paddedResult.errors.some((item) => item.code === "paid_as_unpaid"));
});

test("resource longer than 2048 is invalid_shape", () => {
  const record = cloneValid("unpaid-402-extract.json");
  record.resource = `${record.resource}${"a".repeat(2048)}`;
  record.request.url = record.resource;
  const result = evaluateRecord(record, catalog);
  assert.equal(result.ok, false);
  assert.ok(result.codes.includes("invalid_shape"));
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

test("offer payload scheme, network, asset, and resourceUrl must match accept", () => {
  const record = cloneValid("unpaid-offer-receipt-extract.json");
  record.offerReceipt.offers[0].payload.scheme = "upto";
  record.offerReceipt.offers[0].payload.network = "eip155:1";
  record.offerReceipt.offers[0].payload.asset = "0x0000000000000000000000000000000000000001";
  record.offerReceipt.offers[0].payload.resourceUrl = "https://agents.samedaydesk.com/scan";
  const result = validateRecord(record, catalog);
  assert.equal(result.ok, false);
  const paths = result.errors.filter((item) => item.code === "offer_accept_mismatch").map((item) => item.path);
  assert.ok(paths.includes("$.offerReceipt.offers[0].payload.scheme"));
  assert.ok(paths.includes("$.offerReceipt.offers[0].payload.network"));
  assert.ok(paths.includes("$.offerReceipt.offers[0].payload.asset"));
  assert.ok(paths.includes("$.offerReceipt.offers[0].payload.resourceUrl"));
});

test("resource pathname and request.url must match the receipt identity", () => {
  const routed = cloneValid("unpaid-402-extract.json");
  routed.route = "/scan";
  const routedResult = evaluateRecord(routed, catalog);
  assert.equal(routedResult.ok, false);
  assert.ok(routedResult.codes.includes("resource_route_mismatch"));

  const urlDrift = cloneValid("unpaid-402-extract.json");
  urlDrift.request.url = "https://agents.samedaydesk.com/scan";
  const urlResult = evaluateRecord(urlDrift, catalog);
  assert.equal(urlResult.ok, false);
  assert.ok(urlResult.codes.includes("request_url_mismatch"));
});

test("designated seed pointing at a valid unpaid fixture is SEED_ACCEPTED", () => {
  const broken = structuredClone(catalog);
  broken.designatedSeed = {
    ...catalog.designatedSeed,
    file: "valid/unpaid-402-extract.json",
  };
  const seed = evaluateSeededFailure(broken);
  assert.equal(seed.caught, false);
  assert.equal(seed.error.code, "SEED_ACCEPTED");
});

test("valid fixtures never carry a payment header or settlement", () => {
  for (const filePath of listJsonFiles(VALID_FIXTURES)) {
    const raw = readFileSync(filePath, "utf8");
    assert.doesNotMatch(
      raw,
      /"PAYMENT-SIGNATURE"|"X-PAYMENT-RESPONSE"|"X-PAYMENT"|"PAYMENT-RESPONSE"/,
    );
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
    assert.doesNotMatch(src, /\bfetch\s*\(/);
    assert.doesNotMatch(src, /npm publish/);
    assert.doesNotMatch(src, /vendor\/neomorphic/);
  }
  assert.match(cliSrc, /neo-kernel-vendor are refused/);
  assert.ok(REFUSED_FLAGS.includes("neo-kernel-vendor"));
  assert.match(FIXTURE_ROOT, /tools\/commerce-receipts\/fixtures$/);
  assert.equal(FIXTURE_ROOT.startsWith(here), true);
});

test("designated seed settlement tx matches in-tree facilitator evidence", () => {
  const seed = loadJson(designatedSeedPath(catalog));
  const evidence = loadJson(
    join(ROOT, "tools/evidence-records/fixtures/settlements/agent402-external-validation-purchase-2026-08-29.json"),
  );
  assert.equal(seed.settlement.transaction, evidence.settlement.transaction);
  assert.equal(seed.settlement.operationId, evidence.settlement.operationId);
  assert.equal(seed.settlement.amountUsdc, evidence.settlement.amountUsdc);
  assert.match(seed.settlement.transaction, /^0x[a-f0-9]{64}$/);
});
