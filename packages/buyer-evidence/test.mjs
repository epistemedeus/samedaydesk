import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  REASONS,
  RUNTIMES,
  STATES,
  evmAddr,
  listRuntimeDirs,
  loadCatalog,
  loadRuntime,
  parse402Usd,
  pickPayableAccept,
  verify,
} from "./index.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const catalog = loadCatalog();

function matchingAccept() {
  const c = catalog.contract;
  return {
    scheme: c.scheme,
    network: c.network,
    payTo: c.payTo,
    asset: c.asset,
    amount: c.amount,
    maxAmountRequired: c.maxAmountRequired,
    extra: c.extra,
  };
}

function matchingResource() {
  return {
    x402Version: catalog.contract.x402Version,
    resource: { url: catalog.route.exampleUrl },
    accepts: [matchingAccept()],
  };
}

test("package is zero-dependency ESM at version 0.1.0", () => {
  const pkg = JSON.parse(readFileSync(join(here, "package.json"), "utf8"));
  assert.equal(pkg.name, "@samedaydesk/buyer-evidence");
  assert.equal(pkg.version, "0.1.0");
  assert.equal(pkg.private, false);
  assert.equal(pkg.type, "module");
  assert.equal(pkg.license, "UNLICENSED");
  assert.equal(pkg.dependencies, undefined);
  assert.ok(pkg.exports["."].import);
  assert.ok(pkg.files.includes("fixtures"));
  assert.ok(pkg.files.includes("index.d.ts"));
});

test("JSDoc-only surface matches index.d.ts", () => {
  const dts = readFileSync(join(here, "index.d.ts"), "utf8");
  const verifySrc = readFileSync(join(here, "verify.mjs"), "utf8");
  const indexSrc = readFileSync(join(here, "index.mjs"), "utf8");

  for (const token of [
    "export function verify(resource: unknown, evidence: unknown): VerifyResult",
    "export function loadCatalog(): CatalogDocument",
    "export function loadRuntime(name: string): RuntimeFixtures",
    "export function pickPayableAccept",
    "export function parse402Usd",
    "export function contractFrom402",
    "ok: boolean",
    "reasons: string[]",
  ]) {
    assert.ok(dts.includes(token), `index.d.ts missing ${token}`);
  }

  assert.match(verifySrc, /@param \{unknown\} resource/);
  assert.match(verifySrc, /@param \{unknown\} evidence/);
  assert.match(verifySrc, /@returns \{\{ok: boolean, reasons: string\[\]\}\}/);
  assert.match(indexSrc, /export \{ REASONS, verify \}/);
  assert.match(indexSrc, /loadCatalog/);
});

test("every packed fixture verifies against the catalog pin", () => {
  assert.deepEqual(listRuntimeDirs().sort(), [...RUNTIMES].sort());
  const catalogResult = verify(catalog, catalog);
  assert.equal(catalogResult.ok, true, catalogResult.reasons.join(","));

  for (const name of RUNTIMES) {
    const runtime = loadRuntime(name);
    for (const state of STATES) {
      const result = verify(runtime.states[state], catalog);
      assert.equal(result.ok, true, `${name} ${state}: ${result.reasons.join(",")}`);
    }
  }
});

test("a matching 402 body verifies", () => {
  const result = verify(matchingResource(), catalog);
  assert.equal(result.ok, true, result.reasons.join(","));
  assert.deepEqual(result.reasons, []);
  assert.equal(parse402Usd(matchingResource()), catalog.contract.priceUsd);
  assert.equal(evmAddr(pickPayableAccept(matchingResource().accepts).payTo), evmAddr(catalog.contract.payTo));
});

test("a foreign payTo returns ok: false with foreign_payTo", () => {
  const resource = matchingResource();
  resource.accepts = [
    {
      ...matchingAccept(),
      payTo: "0x0000000000000000000000000000000000000001",
    },
  ];
  const result = verify(resource, catalog);
  assert.equal(result.ok, false);
  assert.ok(result.reasons.includes(REASONS.FOREIGN_PAY_TO), result.reasons.join(","));
});

test("a changed price returns ok: false with changed_price", () => {
  const resource = matchingResource();
  resource.accepts = [
    {
      ...matchingAccept(),
      amount: "49900",
      maxAmountRequired: "49900",
    },
  ];
  const result = verify(resource, catalog);
  assert.equal(result.ok, false);
  assert.ok(result.reasons.includes(REASONS.CHANGED_PRICE), result.reasons.join(","));
});

test("a stale timestamp returns ok: false with stale_timestamp", () => {
  const resource = matchingResource();
  resource.lastUpdated = 1_600_000_000;
  const result = verify(resource, { ...catalog, now: 1_788_454_937_000, maxAgeSeconds: 86_400 });
  assert.equal(result.ok, false);
  assert.ok(result.reasons.includes(REASONS.STALE_TIMESTAMP), result.reasons.join(","));

  const expired = matchingResource();
  expired.validUntil = 1_600_000_000;
  const expiry = verify(expired, { ...catalog, now: Date.now() });
  assert.equal(expiry.ok, false);
  assert.ok(expiry.reasons.includes(REASONS.STALE_TIMESTAMP), expiry.reasons.join(","));
});

test("a missing accepts array returns ok: false with missing_accepts", () => {
  const resource = {
    x402Version: catalog.contract.x402Version,
    resource: { url: catalog.route.exampleUrl },
  };
  const result = verify(resource, catalog);
  assert.equal(result.ok, false);
  assert.ok(result.reasons.includes(REASONS.MISSING_ACCEPTS), result.reasons.join(","));

  const empty = { ...matchingResource(), accepts: [] };
  const emptyResult = verify(empty, catalog);
  assert.equal(emptyResult.ok, false);
  assert.ok(emptyResult.reasons.includes(REASONS.MISSING_ACCEPTS), emptyResult.reasons.join(","));
});
