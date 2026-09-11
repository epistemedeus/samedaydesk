import { describe, it } from "node:test";
import { join } from "node:path";
import { assert, REPO_ROOT, tmp } from "./helpers.mjs";
import { OWNER_QA_BUDGET, OWNER_QA_REPEAT } from "../lib/journey.mjs";
import { runD09Bind } from "../lib/binder.mjs";
import { runPaidCli } from "../lib/execute.mjs";
import { sha256File } from "../lib/sha.mjs";

describe("D09 binder remaining integration binding", { timeout: 180_000 }, () => {
  it("D01 caller next-run note containing SAMPLE is refused as live recurrence", () => {
    const ticket = join(
      REPO_ROOT,
      "server/paid-useful-jobs/fixtures/caller/repeat-job-record/next-run-with-root.json",
    );
    const before = join(
      REPO_ROOT,
      "server/paid-useful-jobs/fixtures/caller/repeat-job-record/input-root/before.json",
    );
    const after = join(
      REPO_ROOT,
      "server/paid-useful-jobs/fixtures/caller/repeat-job-record/input-root/after.json",
    );
    const bind = runD09Bind({
      ticket,
      before,
      after,
      declareAfterSha256: sha256File(after),
      outDir: tmp("w5-d25-d09-sample-"),
      extraArgs: ["--live-recurrence"],
    });
    assert.equal(bind.parsed.parseable, true, bind.proc.stderr + bind.proc.stdout);
    assert.equal(bind.parsed.body.ok, false);
    assert.equal(bind.parsed.body.refused, true);
    assert.equal(bind.parsed.body.code, "sample-labelled-as-live-recurrence");
  });

  it("owner-QA ticket plus changed after is actionable and distinctFromFirst", () => {
    const ticketOut = tmp("w5-d25-d09-ticket-");
    const ticketRun = runPaidCli({
      jobId: "repeat-job-record",
      inputs: { "next-run": OWNER_QA_REPEAT.nextRun, "input-root": OWNER_QA_REPEAT.inputRoot },
      outDir: ticketOut,
    });
    assert.equal(ticketRun.proc.status, 0, ticketRun.proc.stderr + ticketRun.proc.stdout);
    const bind = runD09Bind({
      ticket: join(ticketOut, "repeat-job.json"),
      before: OWNER_QA_BUDGET.before,
      after: OWNER_QA_BUDGET.afterReturn,
      declareAfterSha256: sha256File(OWNER_QA_BUDGET.afterReturn),
      outDir: tmp("w5-d25-d09-ok-"),
    });
    assert.equal(bind.parsed.body.ok, true, JSON.stringify(bind.parsed.body));
    assert.equal(bind.parsed.body.status, "actionable");
    assert.equal(bind.parsed.body.distinctFromFirst, true);
    assert.equal(bind.parsed.body.purchaseAuthority, false);
  });
});
