import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { LIVE_LOCKFILE_URL, PACKAGE_ROOT } from "../harness/paths.mjs";
import { loadLockfiles } from "../harness/fixtures.mjs";

const skipLive = process.env.SKIP_LIVE === "1";

test("live unpaid POST /lockfile-pin-delta is 402 at 5000 atomic; no wallet", {
  timeout: 30_000,
  skip: skipLive,
}, async () => {
  const { changeBody } = loadLockfiles();
  const response = await fetch(LIVE_LOCKFILE_URL, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: changeBody,
  });
  assert.equal(response.status, 402);
  assert.equal(response.headers.has("payment-signature"), false);
  const encoded = response.headers.get("payment-required");
  assert.ok(encoded);
  const challenge = JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
  const accept = challenge.accepts.find((entry) => entry.scheme === "exact");
  assert.equal(accept.amount, "5000");
  assert.equal(accept.network, "eip155:8453");
  assert.equal(accept.asset, "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913");
  assert.equal(accept.payTo, "0x8904dF3DE6DFEe6a7C8cc38619d2f17806213Cee");
  assert.equal(challenge.resource?.url, LIVE_LOCKFILE_URL);
  const receipt = JSON.parse(readFileSync(join(PACKAGE_ROOT, "receipts/live/unpaid-lockfile-402.json"), "utf8"));
  assert.equal(receipt.paid, false);
  assert.equal(receipt.accept.amount, "5000");
});

test("live invalid lockfile body is 400 charged false (still unpaid)", {
  timeout: 30_000,
  skip: skipLive,
}, async () => {
  const response = await fetch(LIVE_LOCKFILE_URL, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: "{}",
  });
  assert.equal(response.status, 400);
  const body = await response.json();
  assert.equal(body.charged, false);
});
