import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { CASES } from "../lib/corpus.mjs";
import { evaluateReport } from "../lib/evaluate.mjs";
import { resolveKit } from "../lib/kit.mjs";
import { materializeCases } from "../lib/materialize.mjs";
import { CASES_ROOT, loadPin } from "../lib/paths.mjs";
import { readWrittenReport, runJob } from "../lib/run-shipped.mjs";

materializeCases();
const pin = loadPin();
const kit = resolveKit(pin);

test("shipped kit is useful-jobs 1.2.0 with ten jobs and page-change 0.1.1", () => {
  assert.equal(kit.engineVersion, "0.1.1");
  assert.equal(kit.jobCount, 10);
  assert.equal(kit.catalogPin, pin.engine.catalogPin);
});

for (const caseDef of CASES) {
  test(`shipped CLI: ${caseDef.id}`, () => {
    const jobPath = join(CASES_ROOT, caseDef.id, "job.json");
    const outDir = mkdtempSync(join(tmpdir(), `m09-fei-${caseDef.id}-`));
    const spawn = runJob(kit, { jobPath, outDir, extraArgs: caseDef.extraArgs });
    const written = readWrittenReport(outDir);
    const result = evaluateReport(caseDef, spawn, written);
    assert.equal(
      result.ok,
      true,
      `${caseDef.id} failed: ${result.failures.join("; ")}\ncounterexample=${JSON.stringify(result.counterexample, null, 2)}\ncommand=${spawn.command}`,
    );
  });
}
