import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { BIN, KIT_ROOT, tempDir } from "./helpers.mjs";
import { loadPins } from "../lib/pins.mjs";
import { runEngineCompare } from "../lib/run-trial.mjs";
import { stageEngine } from "../lib/stage-engine.mjs";

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

test("SchemaStore snapshots match SOURCE byte pins", () => {
  const dir = join(KIT_ROOT, "fixtures", "real-pairs", "schemastore-package-sideEffects");
  const source = JSON.parse(readFileSync(join(dir, "SOURCE.json"), "utf8"));
  assert.equal(source.license, "Apache-2.0");
  assert.equal(source.synthetic, false);
  assert.equal(source.messagesToMaintainer, "not-sent");
  assert.equal(sha256File(join(dir, "before.json")), source.before.sha256);
  assert.equal(sha256File(join(dir, "after.json")), source.after.sha256);
  assert.notEqual(source.before.sha256, source.after.sha256);
});

test("SDS verified-feed pair is a real owner revision pair, not a fixture rewrite of M02", () => {
  const outDir = tempDir("m15-sds-");
  const r = spawnSync(
    process.execPath,
    [BIN, "--pair", "sds-verified-feed", "--out-dir", outDir],
    { encoding: "utf8", cwd: KIT_ROOT, timeout: 60_000 },
  );
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const payload = JSON.parse(r.stdout);
  assert.equal(payload.engineSha, loadPins().m02.sha);
  assert.equal(payload.outcome.kind, "analysis");
  assert.equal(payload.outcome.analysisStatus, "actionable");
  const brief = JSON.parse(readFileSync(join(outDir, "sds-verified-feed", "drift-brief.json"), "utf8"));
  assert.equal(brief.kind, "json-schema");
  assert.equal(brief.impact.deleted[0].pointer, "/properties/qa");
  assert.equal(brief.impact.deleted[0].reason, "present-before-only");
  assert.equal(brief.impact.breaking.length, 0);
  assert.equal(brief.impact.unchangedCount, 2);
  assert.equal(brief.customerBrief, false);
});

test("identical before/after real file is a valid no-change analysis", () => {
  const outDir = tempDir("m15-nochange-");
  const engine = stageEngine({ dest: join(outDir, ".engine") });
  const before = join(KIT_ROOT, "fixtures", "real-pairs", "schemastore-package-sideEffects", "before.json");
  const used = join(KIT_ROOT, "fixtures", "real-pairs", "schemastore-package-sideEffects", "used.json");
  const ran = runEngineCompare({
    engine,
    before,
    after: before,
    used,
    outDir: join(outDir, "same"),
  });
  assert.equal(ran.classified.kind, "analysis");
  assert.equal(ran.classified.analysisStatus, "informational");
  assert.equal(ran.classified.parsed.breaking, 0);
  assert.equal(ran.classified.parsed.ok, true);
});
