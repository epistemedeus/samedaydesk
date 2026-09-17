import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { classifyUnpaid402 } from "./lib/classify.mjs";
import { BOUNDARY, WRITE_BOUNDARY } from "./lib/cite.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(join(here, "MANIFEST.json"), "utf8"));

function runNode(script, args) {
  return spawnSync(process.execPath, [join(here, script), ...args], {
    encoding: "utf8",
    cwd: here,
  });
}

test("manifest covers unpaid-402 accept and reject cases plus seeded false-accept", () => {
  assert.equal(manifest.writeBoundary, WRITE_BOUNDARY);
  assert.ok(manifest.cases.length >= 5);
  assert.equal(manifest.seededFalseAccept, "empty-accepts");
  assert.ok(manifest.cases.some((c) => c.id === "empty-accepts" && c.seededFalseAccept));
  assert.ok(manifest.cases.some((c) => c.id === "extract-current" && c.expect === "accept"));
  assert.equal(manifest.boundary.paymentSent, false);
});

test("each fixture classifies to its expected verdict and code", () => {
  for (const c of manifest.cases) {
    const raw = JSON.parse(readFileSync(join(here, c.file), "utf8"));
    const v = classifyUnpaid402(raw);
    assert.equal(v.verdict, c.expect, `${c.id}: ${v.code} ${v.message}`);
    assert.equal(v.code, c.expectCode, `${c.id}: code ${v.code}`);
    assert.equal(v.paymentSent, false, c.id);
  }
});

test("cold run.mjs --json exits 0", () => {
  const r = runNode("run.mjs", ["--json"]);
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const body = JSON.parse(r.stdout.trim());
  assert.equal(body.ok, true);
  assert.equal(body.status, "pass");
  assert.equal(body.result.failed, 0);
  assert.ok(body.result.total >= 5);
  assert.equal(body.boundary.paymentSent, false);
  assert.equal(body.boundary.stripeOrX402, false);
  assert.equal(body.boundary.liveProbe, false);
  assert.equal(body.writeBoundary, WRITE_BOUNDARY);
});

test("seeded empty-accepts as accept exits 1 with SEED_REJECT", () => {
  const r = runNode("run.mjs", ["--seeded-failure", "--json"]);
  assert.equal(r.status, 1, r.stderr || r.stdout);
  const body = JSON.parse(r.stdout.trim());
  assert.equal(body.ok, false);
  assert.equal(body.error.code, "SEED_REJECT");
  assert.equal(body.error.kind, "false_accept");
  assert.equal(body.result.observedVerdict, "reject");
  assert.equal(body.result.observedCode, "missing_accepts");
  assert.equal(body.result.claimedVerdict, "accept");
  assert.equal(body.boundary.paymentSent, false);
});

test("verify --expect accept on empty-accepts exits 1 SEED_REJECT", () => {
  const r = runNode("verify.mjs", [
    "--json",
    "--fixture",
    "fixtures/cases/empty-accepts.json",
    "--expect",
    "accept",
  ]);
  assert.equal(r.status, 1);
  const body = JSON.parse(r.stdout.trim());
  assert.equal(body.ok, false);
  assert.equal(body.error.code, "SEED_REJECT");
  assert.equal(body.result.observedCode, "missing_accepts");
});

test("unknown flag exits 2", () => {
  const r = runNode("run.mjs", ["--case", "nope", "--json"]);
  assert.equal(r.status, 2);
  const body = JSON.parse(r.stdout.trim());
  assert.equal(body.error.code, "unknown_flag");
});

test("boundary pin stays unpaid", () => {
  assert.equal(BOUNDARY.paymentSent, false);
  assert.equal(BOUNDARY.stripeOrX402, false);
  assert.equal(BOUNDARY.toolsCalled, false);
  assert.equal(BOUNDARY.liveProbe, false);
});
