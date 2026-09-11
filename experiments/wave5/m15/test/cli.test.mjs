import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { BIN, KIT_ROOT, tempDir } from "./helpers.mjs";
import { loadPins } from "../lib/pins.mjs";

function run(args, extra = {}) {
  return spawnSync(process.execPath, [BIN, ...args], {
    encoding: "utf8",
    cwd: KIT_ROOT,
    timeout: 60_000,
    ...extra,
  });
}

function parse(r) {
  const text = String(r.stdout || "").trim();
  assert.ok(text, `empty stdout stderr=${r.stderr}`);
  return JSON.parse(text);
}

test("CLI --help names public flags and the M02 engine", () => {
  const r = run(["--help"]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /--pair/);
  assert.match(r.stdout, /--corpus/);
  assert.match(r.stdout, /webhook-drift/);
  assert.match(r.stdout, /Not OpenAPI/);
  assert.match(r.stdout, /unknown/);
});

test("CLI --list reports pinned engine SHA and M06 not-exported", () => {
  const r = run(["--list"]);
  assert.equal(r.status, 0, r.stderr);
  const payload = parse(r);
  assert.equal(payload.ok, true);
  assert.equal(payload.engineSha, loadPins().m02.sha);
  assert.equal(payload.m06.status, "not-exported");
  assert.equal(payload.fieldPhase, "owner-dry-run");
  const ids = payload.pairs.map((p) => p.id);
  assert.ok(ids.includes("schemastore-package-sideEffects"));
  assert.ok(ids.includes("sds-verified-feed"));
});

test("CLI unknown pair refuses without claiming a customer brief", () => {
  const r = run(["--pair", "no-such-pair"]);
  assert.equal(r.status, 2);
  const payload = parse(r);
  assert.equal(payload.ok, false);
  assert.equal(payload.code, "unknown-pair");
  assert.equal(payload.customerBrief, false);
  assert.equal(payload.maintainerUsefulness, "unknown");
});

test("CLI missing engine is incomplete, not a skipped pass", () => {
  const r = run(["--pair", "schemastore-package-sideEffects"], {
    env: { ...process.env, M15_ENGINE_ROOT: join(KIT_ROOT, "does-not-exist") },
  });
  assert.equal(r.status, 2);
  const payload = parse(r);
  assert.equal(payload.ok, false);
  assert.equal(payload.incomplete, true);
  assert.equal(payload.code, "missing-engine");
});

test("CLI SchemaStore pair is owner dry-run analysis on the real files", () => {
  const outDir = tempDir("m15-cli-store-");
  const r = run(["--pair", "schemastore-package-sideEffects", "--out-dir", outDir]);
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const payload = parse(r);
  assert.equal(payload.ok, true);
  assert.equal(payload.engineSha, loadPins().m02.sha);
  assert.equal(payload.outcome.kind, "analysis");
  assert.equal(payload.outcome.analysisStatus, "actionable");
  assert.equal(payload.outcome.breaking, 1);
  assert.equal(payload.maintainerUsefulness, "unknown");
  assert.equal(payload.customerBrief, false);
  const brief = JSON.parse(readFileSync(join(outDir, "schemastore-package-sideEffects", "drift-brief.json"), "utf8"));
  assert.equal(brief.kind, "json-schema");
  assert.equal(brief.customerBrief, false);
  assert.equal(brief.impact.breaking[0].pointer, "/properties/sideEffects");
  assert.equal(brief.impact.breaking[0].reason, "type-change");
  assert.equal(brief.impact.unchangedCount, 1);
  assert.equal(JSON.stringify(brief).includes("/properties/scripts"), false);
  const report = JSON.parse(readFileSync(join(outDir, "schemastore-package-sideEffects", "trial-report.json"), "utf8"));
  assert.equal(report.maintainerUsefulness, "unknown");
  assert.equal(report.messagesSent, false);
  assert.equal(existsSync(join(outDir, ".engine", "tools", "json-schema-webhook-drift", "bin", "webhook-drift.mjs")), true);
});
