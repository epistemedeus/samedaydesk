import { describe, it } from "node:test";
import { copyFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  assert,
  classifyResult,
  OWNER_QA_BUDGET,
  runPaidCli,
  tmp,
} from "./helpers.mjs";

describe("analysis outcome vs transport/engine failure", { timeout: 120_000 }, () => {
  it("identical before/after is a valid no-change report, not a crash", () => {
    const work = tmp("w5-d25-nochange-");
    const after = join(work, "after.json");
    copyFileSync(OWNER_QA_BUDGET.before, after);
    const outDir = join(work, "out");
    const run = runPaidCli({
      jobId: "vendor-budget-impact",
      inputs: { before: OWNER_QA_BUDGET.before, after },
      outDir,
    });
    assert.equal(run.proc.status, 0, run.proc.stderr + run.proc.stdout);
    const classified = classifyResult({
      proc: run.proc,
      parsed: run.parsed,
      advertised: ["budget-impact.json", "budget-impact.md"],
      outDir,
    });
    assert.equal(classified.kind, "analysis-no-change");
    assert.equal(classified.validAnalysis, true);
    assert.equal(classified.complete, true);
    assert.equal(run.parsed.body.sold, false);
    assert.equal(run.parsed.body.engine.status, "informational");
  });

  it("unparseable pricing bytes yield a delivered analysis refusal, not wrapper crash", () => {
    const work = tmp("w5-d25-refuse-");
    const bad = join(work, "before.json");
    writeFileSync(bad, "not json\n");
    const outDir = join(work, "out");
    const run = runPaidCli({
      jobId: "vendor-budget-impact",
      inputs: { before: bad, after: OWNER_QA_BUDGET.after },
      outDir,
    });
    assert.equal(run.parsed.parseable, true);
    const classified = classifyResult({
      proc: run.proc,
      parsed: run.parsed,
      advertised: ["budget-impact.json", "budget-impact.md"],
      outDir,
    });
    assert.equal(classified.kind, "analysis-refusal", JSON.stringify(classified));
    assert.equal(classified.validAnalysis, true);
    assert.equal(run.parsed.body.ok, true);
    assert.equal(run.parsed.body.engine.status, "refused");
    assert.equal(run.parsed.body.sold, false);
  });

  it("missing required input is wrapper-refusal, not an analysis report", () => {
    const run = runPaidCli({
      jobId: "vendor-budget-impact",
      inputs: { before: OWNER_QA_BUDGET.before },
    });
    assert.equal(run.proc.status, 2);
    const classified = classifyResult({ proc: run.proc, parsed: run.parsed, advertised: [] });
    assert.equal(classified.kind, "wrapper-refusal");
    assert.equal(classified.code, "missing-required-inputs");
    assert.equal(run.parsed.body.sold, false);
  });

  it("unknown job is wrapper-refusal with structured JSON", () => {
    const run = runPaidCli({ jobId: "not-a-real-job" });
    assert.equal(run.proc.status, 2);
    const classified = classifyResult({ proc: run.proc, parsed: run.parsed });
    assert.equal(classified.kind, "wrapper-refusal");
    assert.equal(classified.code, "unknown-job");
    assert.equal(run.parsed.body.ok, false);
  });
});
