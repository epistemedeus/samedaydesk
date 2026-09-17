import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { classifyAbsenceAsDemand } from "./lib/classify.mjs";
import { listCaseFiles, loadManifest } from "./lib/catalog.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const manifest = loadManifest();

function runNode(script, args) {
  return spawnSync(process.execPath, [join(here, script), ...args], {
    encoding: "utf8",
    cwd: here,
  });
}

test("manifest has honest controls, rejects, and seeded absence-as-demand", () => {
  assert.equal(manifest.feature, "absence-not-demand-w1102");
  assert.ok(manifest.cases.length >= 8);
  const accepts = manifest.cases.filter((c) => c.expect === "accept");
  const rejects = manifest.cases.filter((c) => c.expect === "reject");
  assert.ok(accepts.length >= 2, "need honest accept controls so always-reject cannot pass");
  assert.ok(rejects.length >= 5);
  assert.ok(
    manifest.cases.some(
      (c) => c.seededAbsenceAsDemand || c.id === manifest.seededAbsenceAsDemand,
    ),
  );
  assert.equal(manifest.boundary.paymentSent, false);
  assert.equal(manifest.boundary.stripeOrX402, false);
  assert.equal(manifest.counts.total, manifest.cases.length);
});

test("manifest files match fixtures/cases and expected classify verdict", () => {
  const listed = listCaseFiles().sort();
  const declared = manifest.cases.map((c) => c.file).sort();
  assert.deepEqual(listed, declared);
  for (const c of manifest.cases) {
    const raw = JSON.parse(readFileSync(join(here, c.file), "utf8"));
    const v = classifyAbsenceAsDemand(raw.output || raw, { surface: raw.surface });
    if (c.expect === "reject") {
      assert.equal(v.reject, true, c.id);
      assert.equal(v.absenceAsDemand, true, c.id);
      assert.ok(v.reasons.includes("absence_as_demand"), c.id);
      if (Array.isArray(c.expectedReasons)) {
        for (const code of c.expectedReasons) {
          assert.ok(v.reasons.includes(code), `${c.id} missing ${code}: ${JSON.stringify(v.reasons)}`);
        }
      }
    } else {
      assert.equal(v.reject, false, `${c.id} ${JSON.stringify(v.reasons)}`);
      assert.equal(v.absenceAsDemand, false, c.id);
      assert.equal(v.detail.claimedDemand, false, c.id);
    }
  }
});

test("cold run.mjs exits 0, pins SDS artifacts, and matches all cases", () => {
  const r = runNode("run.mjs", ["--json"]);
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const body = JSON.parse(r.stdout.trim());
  assert.equal(body.ok, true);
  assert.equal(body.result.failed, 0);
  assert.equal(body.result.total, manifest.cases.length);
  assert.ok(body.result.pinCount >= 14, `pinCount=${body.result.pinCount}`);
  assert.equal(body.boundary.paymentSent, false);
  assert.equal(body.boundary.stripeOrX402, false);
  assert.equal(body.boundary.liveFetch, false);
});

test("seeded absence-as-demand as accept exits ≠0 with SEED_REJECT", () => {
  const r = runNode("run.mjs", ["--seeded-absence-as-demand", "--json"]);
  assert.equal(r.status, 1, r.stderr || r.stdout);
  const body = JSON.parse(r.stdout.trim());
  assert.equal(body.ok, false);
  assert.equal(body.error.code, "SEED_REJECT");
  assert.ok(
    (body.result?.reasons || body.error?.reasons || []).includes("absence_as_demand") ||
      body.result?.absenceAsDemand === true,
  );
  assert.ok((body.result?.reasons || []).includes("mcp_surface_get_as_demand"));
});

test("verify --expect accept on mcp-surface-get-as-demand exits 1", () => {
  const r = runNode("verify.mjs", [
    "--json",
    "--fixture",
    "fixtures/cases/mcp-surface-get-as-demand.json",
    "--expect",
    "accept",
  ]);
  assert.equal(r.status, 1);
  const body = JSON.parse(r.stdout.trim());
  assert.equal(body.ok, false);
  assert.equal(body.error.code, "SEED_REJECT");
});

test("--seeded-failure alias matches --seeded-absence-as-demand", () => {
  const a = runNode("run.mjs", ["--seeded-failure", "--json"]);
  const b = runNode("run.mjs", ["--seeded-absence-as-demand", "--json"]);
  assert.equal(a.status, 1);
  assert.equal(b.status, 1);
  assert.equal(JSON.parse(a.stdout.trim()).error.code, "SEED_REJECT");
  assert.equal(JSON.parse(b.stdout.trim()).error.code, "SEED_REJECT");
});

test("honest control fed as reject is FALSE_ACCEPT (always-reject cannot pass)", () => {
  const r = runNode("verify.mjs", [
    "--json",
    "--fixture",
    "fixtures/cases/paid-activity-unavailable-honest.json",
    "--expect",
    "reject",
  ]);
  assert.equal(r.status, 1);
  const body = JSON.parse(r.stdout.trim());
  assert.equal(body.ok, false);
  assert.equal(body.error.code, "FALSE_ACCEPT");
});

test("--live is refused", () => {
  const r = runNode("run.mjs", ["--live", "--json"]);
  assert.equal(r.status, 1);
  const body = JSON.parse(r.stdout.trim());
  assert.equal(body.ok, false);
  assert.equal(body.error.code, "LIVE_REFUSED");
});
