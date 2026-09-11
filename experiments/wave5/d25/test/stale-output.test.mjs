import { describe, it } from "node:test";
import { existsSync } from "node:fs";
import {
  assert,
  classifyResult,
  join,
  OWNER_QA_BUDGET,
  REPO_ROOT,
  runPaidCli,
  tmp,
  unlinkSync,
} from "./helpers.mjs";

describe("reused output directories and incomplete delivery", { timeout: 120_000 }, () => {
  it("foreign artifacts in a reused outDir are not this job's delivery", () => {
    const outDir = tmp("w5-d25-reuse-");
    const first = runPaidCli({
      jobId: "vendor-budget-impact",
      inputs: { before: OWNER_QA_BUDGET.before, after: OWNER_QA_BUDGET.after },
      outDir,
    });
    assert.equal(first.proc.status, 0);
    assert.equal(existsSync(join(outDir, "budget-impact.json")), true);

    const feedBefore = join(REPO_ROOT, "server/paid-useful-jobs/fixtures/caller/feed-agenda/before.xml");
    const feedAfter = join(REPO_ROOT, "server/paid-useful-jobs/fixtures/caller/feed-agenda/after.xml");
    const second = runPaidCli({
      jobId: "feed-agenda",
      inputs: { before: feedBefore, after: feedAfter },
      outDir,
    });
    assert.equal(second.proc.status, 0, second.proc.stderr + second.proc.stdout);
    const names = (second.parsed.body.outputs || []).map((o) => o.name).sort();
    assert.deepEqual(names, ["agenda.ics", "agenda.json"]);
    assert.equal(names.includes("budget-impact.json"), false);
    assert.equal(existsSync(join(outDir, "budget-impact.json")), true);
    const classified = classifyResult({
      proc: second.proc,
      parsed: second.parsed,
      advertised: ["agenda.json", "agenda.ics"],
      outDir,
    });
    assert.equal(classified.kind, "analysis-change");
    assert.equal(classified.complete, true);
  });

  it("harness treats missing advertised files as incomplete-delivery", () => {
    const outDir = tmp("w5-d25-incomplete-");
    const run = runPaidCli({
      jobId: "vendor-budget-impact",
      inputs: { before: OWNER_QA_BUDGET.before, after: OWNER_QA_BUDGET.after },
      outDir,
    });
    assert.equal(run.proc.status, 0);
    unlinkSync(join(outDir, "budget-impact.md"));
    const classified = classifyResult({
      proc: run.proc,
      parsed: run.parsed,
      advertised: ["budget-impact.json", "budget-impact.md"],
      outDir,
    });
    assert.equal(classified.kind, "incomplete-delivery");
    assert.deepEqual(classified.missing, ["budget-impact.md"]);
    assert.equal(classified.complete, false);
  });
});
