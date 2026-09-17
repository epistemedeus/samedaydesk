import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { classifyAbsenceAsDemand } from "./lib/classify.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(join(here, "MANIFEST.json"), "utf8"));

function runNode(script, args) {
  return spawnSync(process.execPath, [join(here, script), ...args], {
    encoding: "utf8",
    cwd: here,
  });
}

test("manifest has ≥5 cases including seeded absence-as-demand", () => {
  assert.ok(manifest.cases.length >= 5);
  assert.ok(
    manifest.cases.some(
      (c) => c.seededAbsenceAsDemand || c.id === manifest.seededAbsenceAsDemand,
    ),
  );
  assert.equal(manifest.feature, "absence-not-demand-w7");
});

test("each fixture classifies as reject with absence_as_demand", () => {
  for (const c of manifest.cases) {
    const raw = JSON.parse(readFileSync(join(here, c.file), "utf8"));
    const v = classifyAbsenceAsDemand(raw.output || raw, { surface: raw.surface });
    assert.equal(v.reject, true, c.id);
    assert.ok(v.reasons.length > 0, c.id);
    assert.equal(v.absenceAsDemand, true, c.id);
    assert.ok(v.reasons.includes("absence_as_demand"), c.id);
    assert.equal(
      v.detail.claimedSuccess || v.detail.claimedDemand,
      true,
      `${c.id} must claim success or demand`,
    );
  }
});

test("cold run.mjs exits 0 and rejects all", () => {
  const r = runNode("run.mjs", ["--json"]);
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const body = JSON.parse(r.stdout.trim());
  assert.equal(body.ok, true);
  assert.equal(body.result.failed, 0);
  assert.ok(body.result.total >= 5);
  assert.equal(body.boundary.paymentSent, false);
  assert.equal(body.boundary.stripeOrX402, false);
});

test("seeded absence-as-demand as accept exits ≠0 with SEED_REJECT", () => {
  const r = runNode("run.mjs", ["--seeded-absence-as-demand", "--json"]);
  assert.notEqual(r.status, 0);
  assert.equal(r.status, 1);
  const body = JSON.parse(r.stdout.trim());
  assert.equal(body.ok, false);
  assert.equal(body.error.code, "SEED_REJECT");
  assert.ok(
    (body.result?.reasons || body.error?.reasons || []).includes("absence_as_demand") ||
      body.result?.absenceAsDemand === true,
  );
});

test("verify --expect accept on route-absent-as-demand exits 1", () => {
  const r = runNode("verify.mjs", [
    "--json",
    "--fixture",
    "fixtures/cases/route-absent-as-demand.json",
    "--expect",
    "accept",
  ]);
  assert.equal(r.status, 1);
  const body = JSON.parse(r.stdout.trim());
  assert.equal(body.ok, false);
  assert.equal(body.error.code, "SEED_REJECT");
});
