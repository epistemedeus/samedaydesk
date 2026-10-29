import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { ERROR_CODES } from "../src/constants.mjs";

const pack = join(dirname(fileURLToPath(import.meta.url)), "..");
const bin = join(pack, "bin/price-drift.mjs");

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

test("cold verify of matching fixtures exits 0", () => {
  const { status, body } = run([
    "verify",
    "--pin",
    "fixtures/pin.json",
    "--observation",
    "fixtures/ok-observation.json",
  ]);
  assert.equal(status, 0);
  assert.equal(body.ok, true);
  assert.equal(body.liveSdsPricesUnchanged, true);
  assert.equal(body.purchaseAuthority, false);
});

test("seeded extract amount drift exits 1", () => {
  const { status, body } = run([
    "verify",
    "--pin",
    "fixtures/pin.json",
    "--observation",
    "fixtures/reject/extract-amount-drift.json",
  ]);
  assert.equal(status, 1);
  assert.equal(body.ok, false);
  assert.equal(body.code, ERROR_CODES.AMOUNT_DRIFT);
  assert.equal(body.driftDetected, true);
});

test("doctor is a cold fixture run", () => {
  const { status, body } = run(["doctor"]);
  assert.equal(status, 0);
  assert.equal(body.ok, true);
  assert.equal(body.network, false);
  assert.equal(body.honesty.paymentSent, false);
});

test("--live is refused with exit 2", () => {
  const { status, body } = run([
    "verify",
    "--pin",
    "fixtures/pin.json",
    "--observation",
    "fixtures/ok-observation.json",
    "--live",
  ]);
  assert.equal(status, 2);
  assert.equal(body.code, ERROR_CODES.LIVE_HTTP_REFUSED);
});

test("--checkout is refused with exit 2", () => {
  const { status, body } = run([
    "verify",
    "--pin",
    "fixtures/pin.json",
    "--observation",
    "fixtures/ok-observation.json",
    "--checkout",
  ]);
  assert.equal(status, 2);
  assert.equal(body.code, ERROR_CODES.CHECKOUT_ATTEMPTED);
});

test("https observation path is refused", () => {
  const { status, body } = run([
    "verify",
    "--pin",
    "fixtures/pin.json",
    "--observation",
    "https://agents.samedaydesk.com/.well-known/x402",
  ]);
  assert.equal(status, 2);
  assert.equal(body.code, ERROR_CODES.LIVE_HTTP_REFUSED);
});

test("missing --observation is usage exit 2", () => {
  const { status, body } = run(["verify", "--pin", "fixtures/pin.json"]);
  assert.equal(status, 2);
  assert.equal(body.code, ERROR_CODES.MISSING_REQUIRED_INPUTS);
});
