import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
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
  assert.equal(manifest.feature, "absence-not-demand-w822");
  assert.equal(manifest.writeBoundary, "tests/regression-sds/w822-absence/**");
  assert.equal(manifest.disjointFrom, "tests/regression-sds/absence-not-demand-w7/**");
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
  assert.equal(manifest.seededAbsenceAsDemand, "x402scan-unavailable-as-demand");
  assert.equal(manifest.boundary.paymentSent, false);
  assert.equal(manifest.boundary.stripeOrX402, false);
  assert.equal(manifest.boundary.liveFetch, false);
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
  assert.ok(body.result.pinCount >= 12, `pinCount=${body.result.pinCount}`);
  assert.equal(body.boundary.paymentSent, false);
  assert.equal(body.boundary.stripeOrX402, false);
  assert.equal(body.boundary.liveFetch, false);
  const honest = body.result.rows.filter((row) => row.expect === "accept");
  assert.ok(honest.length >= 2);
  assert.ok(honest.every((row) => row.reject === false && row.pass === true));
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
  assert.ok((body.result?.reasons || []).includes("x402scan_unavailable_as_demand"));
});

test("verify --expect accept on x402scan-unavailable-as-demand exits 1", () => {
  const r = runNode("verify.mjs", [
    "--json",
    "--fixture",
    "fixtures/cases/x402scan-unavailable-as-demand.json",
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

test("verify from another cwd exports the real fixture path", () => {
  const tmp = mkdtempSync(join(tmpdir(), "w822-cwd-"));
  const rel = "fixtures/cases/missing-metrics-not-zero-honest.json";
  const r = spawnSync(
    process.execPath,
    [join(here, "verify.mjs"), "--json", "--fixture", rel, "--expect", "accept"],
    { cwd: tmp, encoding: "utf8" },
  );
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const body = JSON.parse(r.stdout.trim());
  const fixture = body.evidence.find((item) => item.kind === "fixture");
  const expected = realpathSync(join(here, rel));
  assert.equal(realpathSync(fixture.path), expected);
  assert.equal(realpathSync(resolve(here, "..", "..", "..", fixture.repoRelative)), expected);
  assert.equal(fixture.path.startsWith(tmp), false);
  assert.equal(body.result.observationClass, "unknown");
});

test("verify rejects payment-like flags and other unknown options", () => {
  const honest = [
    "--json",
    "--fixture",
    "fixtures/cases/missing-metrics-not-zero-honest.json",
    "--expect",
    "accept",
  ];
  const honestRun = runNode("verify.mjs", honest);
  assert.equal(honestRun.status, 0, honestRun.stderr || honestRun.stdout);
  assert.equal(JSON.parse(honestRun.stdout).ok, true);

  for (const flag of ["--pay", "--payment", "--checkout", "--settle", "--publish", "--live", "--write"]) {
    const proc = runNode("verify.mjs", [...honest, flag]);
    assert.equal(proc.status, 2, `${flag} ${proc.stdout}`);
    const body = JSON.parse(proc.stdout);
    assert.equal(body.ok, false);
    assert.equal(body.error.code, "REFUSED");
    assert.notEqual(body.status, "pass");
  }

  for (const flag of ["--not-a-real-flag", "-z"]) {
    const proc = runNode("verify.mjs", [...honest, flag]);
    assert.equal(proc.status, 2, `${flag} ${proc.stdout}`);
    const body = JSON.parse(proc.stdout);
    assert.equal(body.ok, false);
    assert.equal(body.error.code, "USAGE");
  }
});

test("missing fixture and unknown flag exit 2", () => {
  const missing = runNode("verify.mjs", ["--json", "--fixture", "fixtures/cases/not-a-case.json"]);
  assert.equal(missing.status, 2, missing.stderr || missing.stdout);
  assert.equal(JSON.parse(missing.stdout).error.code, "MISSING_FIXTURE");
  const unknown = runNode("run.mjs", ["--not-a-real-flag", "--json"]);
  assert.equal(unknown.status, 2, unknown.stderr || unknown.stdout);
  assert.equal(JSON.parse(unknown.stdout).error.code, "unknown_flag");
});

test("--live is refused without paying", () => {
  const r = runNode("run.mjs", ["--live", "--json"]);
  assert.notEqual(r.status, 0);
  const body = JSON.parse(r.stdout.trim());
  assert.equal(body.ok, false);
  assert.equal(body.error.code, "LIVE_FORBIDDEN");
  assert.equal(body.boundary.paymentSent, false);
});
