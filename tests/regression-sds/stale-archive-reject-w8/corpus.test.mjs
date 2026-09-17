import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { classifyStaleArchive } from "./lib/classify.mjs";
import { listCaseFiles, loadManifest } from "./lib/catalog.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const manifest = loadManifest();

function runNode(script, args) {
  return spawnSync(process.execPath, [join(here, script), ...args], {
    encoding: "utf8",
    cwd: here,
  });
}

test("manifest has honest controls, rejects, and seeded stale-as-current", () => {
  assert.equal(manifest.feature, "stale-archive-reject-w8");
  assert.equal(manifest.cases.length, 13);
  const accepts = manifest.cases.filter((c) => c.expect === "accept");
  const rejects = manifest.cases.filter((c) => c.expect === "reject");
  assert.ok(accepts.length >= 2, "need honest accept controls so always-reject cannot pass");
  assert.ok(rejects.length >= 5);
  assert.ok(
    manifest.cases.some(
      (c) => c.seededStaleAsCurrent || c.id === manifest.seededStaleAsCurrent,
    ),
  );
  assert.equal(manifest.boundary.paymentSent, false);
  assert.equal(manifest.boundary.stripeOrX402, false);
  assert.equal(manifest.currentPin.version, "1.4.7");
  assert.equal(manifest.negativeControl.version, "1.1.0");
});

test("manifest files match fixtures/cases and expected classify verdict", () => {
  const listed = listCaseFiles().sort();
  const declared = manifest.cases.map((c) => c.file).sort();
  assert.deepEqual(listed, declared);
  for (const c of manifest.cases) {
    const raw = JSON.parse(readFileSync(join(here, c.file), "utf8"));
    const v = classifyStaleArchive(raw.output || raw, { surface: raw.surface });
    if (c.expect === "reject") {
      assert.equal(v.reject, true, c.id);
      assert.equal(v.staleAsCurrent, true, c.id);
      assert.ok(v.reasons.includes("stale_archive"), c.id);
      assert.ok(v.reasons.includes("stale_as_current"), c.id);
      if (Array.isArray(c.expectedReasons)) {
        const withoutProbe = c.expectedReasons.filter((code) => code !== "product_refuse");
        for (const code of withoutProbe) {
          assert.ok(
            v.reasons.includes(code),
            `${c.id} missing ${code}: ${JSON.stringify(v.reasons)}`,
          );
        }
      }
    } else {
      assert.equal(v.reject, false, `${c.id} ${JSON.stringify(v.reasons)}`);
      assert.equal(v.staleAsCurrent, false, c.id);
    }
  }
});

test("cold run.mjs exits 0, pins SDS archives, and matches all cases", () => {
  const r = runNode("run.mjs", ["--json"]);
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const body = JSON.parse(r.stdout.trim());
  assert.equal(body.ok, true);
  assert.equal(body.result.failed, 0);
  assert.equal(body.result.total, manifest.cases.length);
  assert.ok(body.result.pinCount >= 20, `pinCount=${body.result.pinCount}`);
  assert.equal(body.result.current.version, "1.4.7");
  assert.equal(body.boundary.paymentSent, false);
  assert.equal(body.boundary.stripeOrX402, false);
  assert.equal(body.boundary.liveFetch, false);
  const obtainStale = body.result.rows.find((row) => row.id === "obtain-stale-110-vs-current");
  assert.equal(obtainStale.pass, true);
  assert.equal(obtainStale.probe.refused, true);
  assert.equal(obtainStale.probe.code, "wrong-size");
  assert.equal(obtainStale.probe.childExit, 0);
  const obtainDigest = body.result.rows.find((row) => row.id === "obtain-stale-110-wrong-digest");
  assert.equal(obtainDigest.probe.code, "wrong-digest");
  assert.equal(obtainDigest.probe.childExit, 0);
  const obtainOk = body.result.rows.find((row) => row.id === "obtain-current-147-honest");
  assert.equal(obtainOk.probe.ok, true);
  assert.equal(obtainOk.probe.refused, false);
});

test("seeded stale-as-current as accept exits ≠0 with SEED_REJECT", () => {
  const r = runNode("run.mjs", ["--seeded-stale-as-current", "--json"]);
  assert.equal(r.status, 1, r.stderr || r.stdout);
  const body = JSON.parse(r.stdout.trim());
  assert.equal(body.ok, false);
  assert.equal(body.error.code, "SEED_REJECT");
  assert.equal(body.result.id, "stale-110-as-current");
  assert.ok(body.result.staleAsCurrent === true);
  assert.ok((body.result?.reasons || []).includes("stale_archive"));
  assert.ok((body.result?.reasons || []).includes("negative_control_110"));
});

test("verify --expect accept on stale-110-as-current exits 1", () => {
  const r = runNode("verify.mjs", [
    "--json",
    "--fixture",
    "fixtures/cases/stale-110-as-current.json",
    "--expect",
    "accept",
  ]);
  assert.equal(r.status, 1);
  const body = JSON.parse(r.stdout.trim());
  assert.equal(body.ok, false);
  assert.equal(body.error.code, "SEED_REJECT");
});

test("--seeded-failure alias matches --seeded-stale-as-current", () => {
  const a = runNode("run.mjs", ["--seeded-failure", "--json"]);
  const b = runNode("run.mjs", ["--seeded-stale-as-current", "--json"]);
  assert.equal(a.status, 1);
  assert.equal(b.status, 1);
  assert.equal(JSON.parse(a.stdout.trim()).error.code, "SEED_REJECT");
  assert.equal(JSON.parse(b.stdout.trim()).error.code, "SEED_REJECT");
});

test("--live and --pay are refused", () => {
  const live = runNode("run.mjs", ["--live", "--json"]);
  assert.equal(live.status, 2);
  assert.equal(JSON.parse(live.stdout.trim()).error.code, "LIVE_REFUSE");
  const pay = runNode("run.mjs", ["--pay", "--json"]);
  assert.equal(pay.status, 2);
  assert.equal(JSON.parse(pay.stdout.trim()).error.code, "PAY_REFUSE");
});
