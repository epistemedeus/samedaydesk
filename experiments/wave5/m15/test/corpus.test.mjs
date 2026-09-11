import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BIN, KIT_ROOT, tempDir } from "./helpers.mjs";
import { loadPins } from "../lib/pins.mjs";

function run(args) {
  return spawnSync(process.execPath, [BIN, ...args], {
    encoding: "utf8",
    cwd: KIT_ROOT,
    timeout: 60_000,
  });
}

test("corpus replay matches current M02 predictions, including valid no-change and refusals", () => {
  const outDir = tempDir("m15-corpus-");
  const r = run(["--corpus", "--out-dir", outDir]);
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const payload = JSON.parse(r.stdout);
  assert.equal(payload.ok, true);
  assert.equal(payload.engineSha, loadPins().m02.sha);
  assert.equal(payload.m06.status, "not-exported");
  const byId = Object.fromEntries(payload.results.map((row) => [row.id, row]));

  assert.equal(byId["false-schema"].outcome.kind, "analysis");
  assert.equal(byId["false-schema"].outcome.analysisStatus, "actionable");
  assert.equal(byId["false-schema"].outcome.breaking, 1);
  const falseBrief = JSON.parse(
    readFileSync(join(outDir, "corpus", "false-schema", "drift-brief.json"), "utf8"),
  );
  assert.equal(falseBrief.impact.breaking[0].reason, "structural-change");

  assert.equal(byId["ref-siblings"].outcome.analysisStatus, "informational");
  assert.equal(byId["ref-siblings"].outcome.breaking, 0);

  assert.equal(byId["required-at-required-pointer"].outcome.analysisStatus, "informational");
  assert.equal(byId["required-at-required-pointer"].outcome.breaking, 0);

  const rootBrief = JSON.parse(
    readFileSync(join(outDir, "corpus", "required-at-root", "drift-brief.json"), "utf8"),
  );
  assert.equal(rootBrief.status, "actionable");
  assert.equal(rootBrief.impact.breaking[0].pointer, "");
  assert.equal(rootBrief.impact.breaking[0].reason, "structural-change");
  assert.deepEqual(rootBrief.impact.breaking[0].before.required, ["amount"]);
  assert.deepEqual(rootBrief.impact.breaking[0].after.required, ["amount", "id"]);

  assert.equal(byId["numeric-int"].outcome.analysisStatus, "actionable");
  assert.equal(byId["numeric-frac"].outcome.analysisStatus, "informational");
  assert.equal(byId["numeric-frac"].outcome.breaking, 0);

  assert.equal(byId["unlike-dialect"].outcome.analysisStatus, "informational");
  assert.equal(byId["openapi-refuse"].outcome.kind, "analysis");
  assert.equal(byId["openapi-refuse"].outcome.analysisStatus, "refused");
  assert.equal(byId["openapi-refuse"].outcome.refuseCode, "not-this-job-openapi");
});
