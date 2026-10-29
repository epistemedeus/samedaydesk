import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { ERROR_CODES } from "../src/constants.mjs";
import { honestyEnvelope } from "../src/honesty.mjs";
import { parseArgs } from "../src/load.mjs";
import { originFromAbsoluteUrl, isLiveSdsOrigin } from "../src/normalize.mjs";
import { pass, reject, verifyDocuments } from "../src/verify.mjs";

const pack = join(dirname(fileURLToPath(import.meta.url)), "..");
const bin = join(pack, "bin/price-drift.mjs");

function load(rel) {
  return JSON.parse(readFileSync(join(pack, rel), "utf8"));
}

function run(args) {
  const r = spawnSync(process.execPath, [bin, ...args], {
    encoding: "utf8",
    cwd: pack,
  });
  let body = null;
  const text = String(r.stdout || "").trim();
  if (text.startsWith("{")) body = JSON.parse(text);
  return { status: r.status, body, stderr: String(r.stderr || ""), stdout: text };
}

test("pin that redefines extract 0.005 → 0.05 is pin_live_mismatch, not a match", () => {
  const pin = load("fixtures/pin.json");
  const observation = load("fixtures/ok-observation.json");
  pin.routes[0].amount = "0.05";
  pin.routes[0].amountAtomic = "50000";
  observation.routes[0].amount = "0.05";
  observation.routes[0].amountAtomic = "50000";
  const result = verifyDocuments({ pin, observation });
  assert.equal(result.ok, false);
  assert.equal(result.code, ERROR_CODES.PIN_LIVE_MISMATCH);
  assert.equal(result.purchaseAuthority, false);
  assert.equal(result.liveSdsPricesUnchanged, true);
  assert.match(result.message, /0\.05/);
});

test("unpinned billed SKU without newSku flags is extra_sku", () => {
  const result = verifyDocuments({
    pin: load("fixtures/pin.json"),
    observation: load("fixtures/reject/extra-sku-silent.json"),
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, ERROR_CODES.EXTRA_SKU);
  assert.equal(result.driftDetected, true);
});

test("HTTP 402 + charged + success is http_402_as_success", () => {
  const result = verifyDocuments({
    pin: load("fixtures/pin.json"),
    observation: load("fixtures/reject/charged-402.json"),
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, ERROR_CODES.HTTP_402_AS_SUCCESS);
  assert.equal(result.honesty.charged, false);
});

test("foreign origin URL is origin_drift, not SDS extract", () => {
  const result = verifyDocuments({
    pin: load("fixtures/pin.json"),
    observation: load("fixtures/reject/foreign-origin.json"),
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, ERROR_CODES.ORIGIN_DRIFT);
  assert.match(result.message, /evil\.example/);
});

test("trailing-dot SDS host still counts as live origin; other hosts do not", () => {
  assert.equal(originFromAbsoluteUrl("https://agents.samedaydesk.com./extract"), "https://agents.samedaydesk.com");
  assert.equal(isLiveSdsOrigin("https://agents.samedaydesk.com"), true);
  assert.equal(isLiveSdsOrigin("https://evil.example"), false);
  assert.equal(isLiveSdsOrigin("http://agents.samedaydesk.com"), false);
});

test("reject/pass extra cannot overwrite ok, purchaseAuthority, or liveSdsPricesUnchanged", () => {
  const rejected = reject("amount_drift", "drifted", {
    ok: true,
    purchaseAuthority: true,
    liveSdsPricesUnchanged: false,
    findings: [{ code: "amount_drift" }],
  });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.status, "reject");
  assert.equal(rejected.code, "amount_drift");
  assert.equal(rejected.purchaseAuthority, false);
  assert.equal(rejected.liveSdsPricesUnchanged, true);
  assert.equal(rejected.findings.length, 1);

  const matched = pass({
    ok: false,
    purchaseAuthority: true,
    liveSdsPricesUnchanged: false,
    honesty: { purchaseAuthority: true, paymentSent: true },
    compared: [],
  });
  assert.equal(matched.ok, true);
  assert.equal(matched.code, "match");
  assert.equal(matched.purchaseAuthority, false);
  assert.equal(matched.liveSdsPricesUnchanged, true);
  assert.equal(matched.honesty.purchaseAuthority, false);
  assert.equal(matched.honesty.paymentSent, false);
});

test("honesty extra cannot authorize purchase or payment", () => {
  const honesty = honestyEnvelope({ purchaseAuthority: true, paymentSent: true, charged: true });
  assert.equal(honesty.purchaseAuthority, false);
  assert.equal(honesty.paymentSent, false);
  assert.equal(honesty.charged, false);
});

test("parseArgs ignores __proto__ / constructor flags", () => {
  const args = parseArgs([
    "verify",
    "--__proto__",
    "polluted",
    "--constructor",
    "Object",
    "--pin",
    "fixtures/pin.json",
    "--observation",
    "fixtures/ok-observation.json",
  ]);
  assert.equal(args.pin, "fixtures/pin.json");
  assert.equal(args.observation, "fixtures/ok-observation.json");
  assert.equal(Object.getPrototypeOf(args) === Object.prototype, false);
  assert.equal(Object.prototype.polluted, undefined);
});

test("CLI seeded extra-sku-silent and charged-402 exit 1", () => {
  const extra = run([
    "verify",
    "--pin",
    "fixtures/pin.json",
    "--observation",
    "fixtures/reject/extra-sku-silent.json",
  ]);
  assert.equal(extra.status, 1);
  assert.equal(extra.body.ok, false);
  assert.equal(extra.body.code, ERROR_CODES.EXTRA_SKU);

  const charged = run([
    "verify",
    "--pin",
    "fixtures/pin.json",
    "--observation",
    "fixtures/reject/charged-402.json",
  ]);
  assert.equal(charged.status, 1);
  assert.equal(charged.body.code, ERROR_CODES.HTTP_402_AS_SUCCESS);
});

test("pin extra billed SKU is extra_sku", () => {
  const pin = load("fixtures/pin.json");
  pin.routes.push({
    id: "scan",
    route: "/scan",
    amount: "0.2",
    amountAtomic: "200000",
  });
  const result = verifyDocuments({
    pin,
    observation: load("fixtures/ok-observation.json"),
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, ERROR_CODES.EXTRA_SKU);
});
