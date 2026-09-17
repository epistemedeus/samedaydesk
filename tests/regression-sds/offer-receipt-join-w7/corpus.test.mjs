import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { joinOfferReceipt } from "./lib/join.mjs";
import { SEEDED_MISMATCH_ID } from "./lib/pin.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(join(here, "MANIFEST.json"), "utf8"));

function runNode(script, args) {
  return spawnSync(process.execPath, [join(here, script), ...args], {
    encoding: "utf8",
    cwd: here,
  });
}

test("manifest has matching joins and seeded amount mismatch", () => {
  assert.ok(manifest.cases.length >= 5);
  assert.equal(manifest.feature, "offer-receipt-join-w7");
  assert.equal(manifest.seededMismatch, SEEDED_MISMATCH_ID);
  assert.ok(manifest.cases.some((c) => c.seededMismatch || c.id === SEEDED_MISMATCH_ID));
  assert.equal(manifest.cases.filter((c) => c.expect === "accept").length, 3);
  assert.equal(manifest.boundary.paymentSent, false);
});

test("each fixture classifies to its expected join/reject", () => {
  for (const c of manifest.cases) {
    const raw = JSON.parse(readFileSync(join(here, c.file), "utf8"));
    const v = joinOfferReceipt(raw);
    if (c.expect === "accept") {
      assert.equal(v.joined, true, `${c.id} reasons=${JSON.stringify(v.reasons)}`);
      assert.ok(v.reasons.includes("exact_key_join"), c.id);
    } else {
      assert.equal(v.joined, false, `${c.id} should reject`);
      assert.ok(v.reasons.length > 0, c.id);
    }
  }
});

test("cold run.mjs exits 0 and joins matching SDS catalog offers", () => {
  const r = runNode("run.mjs", ["--cold", "--json"]);
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const body = JSON.parse(r.stdout.trim());
  assert.equal(body.ok, true);
  assert.equal(body.result.failed, 0);
  assert.ok(body.result.total >= 5);
  assert.equal(body.boundary.paymentSent, false);
  assert.equal(body.boundary.stripeOrX402, false);
  const extract = body.result.rows.find((row) => row.id === "cold-extract-join");
  assert.equal(extract.joined, true);
  assert.equal(extract.pass, true);
});

test("seeded amount mismatch as accept exits ≠0 with SEED_REJECT", () => {
  const r = runNode("run.mjs", ["--seeded-mismatch", "--json"]);
  assert.notEqual(r.status, 0);
  assert.equal(r.status, 1);
  const body = JSON.parse(r.stdout.trim());
  assert.equal(body.ok, false);
  assert.equal(body.error.code, "SEED_REJECT");
  const reasons = body.result?.reasons || body.error?.reasons || [];
  assert.ok(
    reasons.some((item) => String(item).startsWith("amount_mismatch")),
    JSON.stringify(reasons),
  );
});

test("verify --expect accept on amount-mismatch exits 1", () => {
  const r = runNode("verify.mjs", [
    "--json",
    "--fixture",
    "fixtures/cases/amount-mismatch.json",
    "--expect",
    "accept",
  ]);
  assert.equal(r.status, 1);
  const body = JSON.parse(r.stdout.trim());
  assert.equal(body.ok, false);
  assert.equal(body.error.code, "SEED_REJECT");
});

test("--pay is refused", () => {
  const r = runNode("run.mjs", ["--pay", "--json"]);
  assert.equal(r.status, 2);
  const body = JSON.parse(r.stdout.trim());
  assert.equal(body.error.code, "money_movement_refused");
});
