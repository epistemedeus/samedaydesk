import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { KIT_ROOT, tempDir } from "./helpers.mjs";
import { runEngineCompare } from "../lib/run-trial.mjs";
import { stageEngine } from "../lib/stage-engine.mjs";

test("unlike dialect schemas keep distinct termsVersion hashes; the kit does not remap them", () => {
  const outDir = tempDir("m15-unlike-");
  const engine = stageEngine({ dest: join(outDir, ".engine") });
  const used = join(KIT_ROOT, "fixtures", "unlike-terms", "used.json");
  const draft07 = join(KIT_ROOT, "fixtures", "unlike-terms", "draft07.json");
  const draft2020 = join(KIT_ROOT, "fixtures", "unlike-terms", "draft202012.json");

  const a = runEngineCompare({
    engine,
    before: draft07,
    after: draft07,
    used,
    outDir: join(outDir, "a"),
  });
  const b = runEngineCompare({
    engine,
    before: draft2020,
    after: draft2020,
    used,
    outDir: join(outDir, "b"),
  });
  const mixed = runEngineCompare({
    engine,
    before: draft07,
    after: draft2020,
    used,
    outDir: join(outDir, "mixed"),
  });

  assert.equal(a.classified.kind, "analysis");
  assert.equal(b.classified.kind, "analysis");
  assert.equal(mixed.classified.kind, "analysis");
  assert.equal(a.classified.analysisStatus, "informational");
  assert.equal(b.classified.analysisStatus, "informational");
  assert.equal(mixed.classified.analysisStatus, "informational");

  const termsA = JSON.parse(readFileSync(join(outDir, "a", "drift-brief.json"), "utf8")).termsVersion;
  const termsB = JSON.parse(readFileSync(join(outDir, "b", "drift-brief.json"), "utf8")).termsVersion;
  const termsMixed = JSON.parse(readFileSync(join(outDir, "mixed", "drift-brief.json"), "utf8")).termsVersion;
  assert.match(termsA, /^sha256:[0-9a-f]{64}$/);
  assert.match(termsB, /^sha256:[0-9a-f]{64}$/);
  assert.notEqual(termsA, termsB);
  assert.notEqual(termsA, termsMixed);
  assert.notEqual(termsB, termsMixed);
});
