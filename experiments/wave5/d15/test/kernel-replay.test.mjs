import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { KIND } from "../lib/contract.mjs";
import { D01_PREV_SHA, D01_SHA, EXECUTION_CONTRACT_VERSION, ensureKernelRoot } from "../lib/kernels.mjs";
import { sha256File } from "../../../../server/paid-useful-jobs/lib/digest.mjs";
import {
  ACTIONABLE,
  PRELOAD_AFTER_INSPECT,
  classifyKernelRace,
  d01ConcurrentOutDir,
  d01ControlLibrary,
  d01GetterSecondEval,
  d01NoChangeControl,
  d01PostMaterializeLibrary,
  d01PostSnapshotOutDirGetter,
  replayKernelCli,
  sds52MutateThenCall,
  spawnKernelServe,
  stageKernelBudget,
  waitForOrigin,
} from "../lib/kernel-race.mjs";

describe("W5-D15 kernel replay (product)", { timeout: 180_000 }, () => {
  it("SDS52 aeef964 mutate-then-call still consumes live mutated bytes", () => {
    const replay = sds52MutateThenCall();
    assert.equal(replay.spawned.transportFailure, false, replay.spawned.stderr);
    const verdict = classifyKernelRace({
      inspectSha: replay.inspectSha,
      liveSha: replay.liveSha,
      wrapper: replay.spawned.wrapper,
      impact: replay.impact,
      control: ACTIONABLE,
    });
    assert.equal(verdict.kind, KIND.RACE_CONSUMED_MUTATED);
    assert.equal(verdict.productAccepted, false);
    assert.equal(replay.impact.status, "informational");
    assert.match(replay.impact.summary, /fieldChanges=0/);
    assert.equal(verdict.receiptSha, replay.liveSha);
    assert.notEqual(verdict.receiptSha, replay.inspectSha);
  });

  it("D01 6bed72dd inspect-to-materialize still consumes mutated bytes", () => {
    const root = ensureKernelRoot(D01_PREV_SHA);
    const replay = replayKernelCli(root, { window: "after-inspect" });
    assert.equal(replay.spawned.transportFailure, false, replay.spawned.stderr);
    assert.equal(replay.flag?.window, "after-inspect-read");
    const verdict = classifyKernelRace({
      inspectSha: replay.inspectSha,
      liveSha: replay.liveSha,
      wrapper: replay.spawned.wrapper,
      impact: replay.impact,
      control: ACTIONABLE,
    });
    assert.notEqual(verdict.kind, KIND.ENGINE_FAILURE);
    assert.notEqual(verdict.kind, KIND.TRANSPORT_FAILURE);
    assert.equal(verdict.kind, KIND.RACE_CONSUMED_MUTATED);
    assert.equal(verdict.productAccepted, false);
    assert.equal(replay.impact.status, "informational");
    assert.match(replay.impact.summary, /fieldChanges=0/);
    assert.equal(verdict.receiptSha, replay.liveSha);
    assert.notEqual(verdict.receiptSha, replay.inspectSha);
  });

  it("D01 execution.v1 post-materialize mutate uses staged bytes and matching receipt", async () => {
    const control = await d01ControlLibrary();
    const lib = await d01PostMaterializeLibrary();
    assert.equal(lib.contract, EXECUTION_CONTRACT_VERSION);
    assert.equal(lib.result.ok, true, lib.result.error);
    assert.equal(lib.result.transport, "ok");
    assert.equal(lib.engineConsumedInspect, true);
    assert.ok(String(lib.seen.engineAfter).includes("/inputs/after.json"));
    assert.notEqual(lib.seen.engineAfter, lib.result.receipt.inputs.find((i) => i.name === "after").path);
    const verdict = classifyKernelRace({
      inspectSha: lib.inspectSha,
      liveSha: lib.liveSha,
      wrapper: lib.result,
      impact: lib.impact,
      control: ACTIONABLE,
    });
    assert.equal(verdict.kind, KIND.FROZEN_CONSUMED);
    assert.equal(verdict.productAccepted, true);
    assert.equal(verdict.wrongReceipt, false);
    assert.equal(verdict.receiptSha, lib.inspectSha);
    assert.notEqual(verdict.receiptSha, lib.liveSha);
    assert.equal(lib.impact.status, "actionable");
    assert.equal(lib.impact.summary, ACTIONABLE.summary);
    assert.equal(lib.stableSha, control.stableSha);
    assert.deepEqual(lib.stable, control.stable);
    assert.equal(existsSync(lib.result.outputs.find((o) => o.name === "budget-impact.json").path), true);
  });

  it("D01 CLI after-stage preload freezes execute bytes (process, not shim)", async () => {
    const root = ensureKernelRoot(D01_SHA);
    const control = await d01ControlLibrary(root);
    const replay = replayKernelCli(root, { window: "after-stage" });
    assert.equal(replay.spawned.transportFailure, false, replay.spawned.stderr);
    assert.equal(replay.flag?.window, "after-materialize-stage");
    assert.equal(replay.flag?.mutated, true);
    const verdict = classifyKernelRace({
      inspectSha: replay.inspectSha,
      liveSha: replay.liveSha,
      wrapper: replay.spawned.wrapper,
      impact: replay.impact,
      control: ACTIONABLE,
    });
    assert.equal(replay.spawned.wrapper.contract, EXECUTION_CONTRACT_VERSION);
    assert.equal(verdict.kind, KIND.FROZEN_CONSUMED);
    assert.equal(verdict.productAccepted, true);
    assert.equal(verdict.wrongReceipt, false);
    assert.equal(replay.impact.status, "actionable");
    assert.equal(replay.stableSha, control.stableSha);
    assert.match(String(replay.enginePath), /\/inputs\/after\.json$/);
  });

  it("D01 inspect-to-execute window uses snapshot bytes or refuses", async () => {
    const root = ensureKernelRoot(D01_SHA);
    const control = await d01ControlLibrary(root);
    const replay = replayKernelCli(root, { window: "after-inspect" });
    assert.equal(replay.spawned.transportFailure, false, replay.spawned.stderr);
    assert.equal(replay.flag?.window, "after-inspect-read");
    assert.equal(replay.flag?.mutated, true);
    const verdict = classifyKernelRace({
      inspectSha: replay.inspectSha,
      liveSha: replay.liveSha,
      wrapper: replay.spawned.wrapper,
      impact: replay.impact,
      control: ACTIONABLE,
    });
    assert.notEqual(verdict.kind, KIND.ENGINE_FAILURE);
    assert.notEqual(verdict.kind, KIND.TRANSPORT_FAILURE);
    assert.equal(verdict.wrongReceipt, false, JSON.stringify(verdict));
    assert.ok(verdict.kind === KIND.FROZEN_CONSUMED || verdict.kind === KIND.ACCURATE_REFUSE);
    assert.equal(verdict.productAccepted, true);
    if (verdict.kind === KIND.FROZEN_CONSUMED) {
      assert.equal(verdict.receiptSha, replay.inspectSha);
      assert.notEqual(verdict.receiptSha, replay.liveSha);
      assert.equal(replay.impact.status, "actionable");
      assert.equal(replay.stableSha, control.stableSha);
    }
  });

  it("D01 outDir getter after snapshot cannot change executed bytes", async () => {
    const control = await d01ControlLibrary();
    const run = await d01PostSnapshotOutDirGetter();
    assert.equal(run.result.ok, true, run.result.error);
    assert.notEqual(run.liveSha, run.inspectSha);
    const verdict = classifyKernelRace({
      inspectSha: run.inspectSha,
      liveSha: run.liveSha,
      wrapper: run.result,
      impact: run.impact,
      control: ACTIONABLE,
    });
    assert.equal(verdict.wrongReceipt, false, JSON.stringify(verdict));
    assert.ok(verdict.kind === KIND.FROZEN_CONSUMED || verdict.kind === KIND.ACCURATE_REFUSE);
    assert.equal(verdict.productAccepted, true);
    if (verdict.kind === KIND.FROZEN_CONSUMED) {
      assert.equal(verdict.receiptSha, run.inspectSha);
      assert.equal(run.stableSha, control.stableSha);
    }
  });

  it("D01 inputs getter is evaluated once; later eval is not the executed input", async () => {
    const prev = await d01GetterSecondEval(ensureKernelRoot(D01_PREV_SHA));
    assert.ok(prev.reads >= 2, `6bed72dd expected repeated inputs reads, got ${prev.reads}`);
    assert.notEqual(prev.liveSha, prev.inspectSha);
    const prevVerdict = classifyKernelRace({
      inspectSha: prev.inspectSha,
      liveSha: prev.liveSha,
      wrapper: prev.result,
      impact: prev.impact,
      control: ACTIONABLE,
    });
    assert.equal(prevVerdict.kind, KIND.RACE_CONSUMED_MUTATED);
    assert.equal(prevVerdict.productAccepted, false);

    const control = await d01ControlLibrary();
    const now = await d01GetterSecondEval(ensureKernelRoot(D01_SHA));
    assert.equal(now.reads, 1);
    assert.equal(now.liveSha, now.inspectSha);
    assert.equal(now.result.ok, true, now.result.error);
    assert.equal(now.result.receipt.inputs.find((i) => i.name === "after").sha256, now.inspectSha);
    assert.equal(now.stableSha, control.stableSha);
  });

  it("D01 useful no-change is complete delivery, not a refuse or crash", async () => {
    const run = await d01NoChangeControl();
    assert.equal(run.result.ok, true, run.result.error);
    assert.equal(run.result.contract, EXECUTION_CONTRACT_VERSION);
    assert.equal(run.result.transport, "ok");
    assert.equal(run.result.delivery.complete, true);
    assert.equal(run.result.analysis.status, "informational");
    assert.equal(run.impact.status, "informational");
    assert.match(run.impact.summary, /fieldChanges=0/);
    assert.notEqual(run.result.code, "engine-crash");
  });

  it("D01 concurrent caller outDir isolates run receipts while publication last-writer remains", async () => {
    const run = await d01ConcurrentOutDir();
    assert.equal(run.changed.ok, true, run.changed.error);
    assert.equal(run.quiet.ok, true, run.quiet.error);
    assert.equal(run.aliasExposed, true);
    assert.equal(run.changedIsolated.status, "actionable");
    assert.equal(run.quietIsolated.status, "informational");
    assert.ok(run.publishedMatchesChanged || run.publishedMatchesQuiet);
    assert.notEqual(run.changed.receipt.outputsDigest, run.quiet.receipt.outputsDigest);
    assert.equal(run.outputsBoundToRunOutDir, true);
    assert.equal(run.changedOutputFollowsAlias, false);
    assert.equal(
      JSON.parse(readFileSync(run.changed.outputs.find((o) => o.name === "budget-impact.json").path, "utf8")).status,
      run.changedIsolated.status,
    );
  });

  it("D01 HTTP /execute with inspect-window preload uses snapshot bytes", async () => {
    const root = ensureKernelRoot(D01_SHA);
    const staged = stageKernelBudget(root);
    const control = await d01ControlLibrary(root);
    const child = spawnKernelServe(root, {
      preload: PRELOAD_AFTER_INSPECT,
      racePath: staged.after,
      overwrite: staged.before,
    });
    const origin = await waitForOrigin(child);
    try {
      const health = await fetch(`${origin}/health`);
      assert.equal(health.status, 200);
      const healthBody = await health.json();
      assert.equal(healthBody.ok, true);
      assert.equal(healthBody.contract, EXECUTION_CONTRACT_VERSION);
      const posted = await fetch(`${origin}/execute`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jobId: "vendor-budget-impact",
          inputs: { before: staged.before, after: staged.after },
        }),
      });
      assert.equal(posted.status, 200);
      const body = await posted.json();
      assert.equal(body.ok, true, body.error);
      assert.equal(body.contract, EXECUTION_CONTRACT_VERSION);
      const liveSha = sha256File(staged.after);
      const inspectSha = staged.inspectAfterSha;
      const impact = JSON.parse(
        readFileSync(body.outputs.find((o) => o.name === "budget-impact.json").path, "utf8"),
      );
      const verdict = classifyKernelRace({
        inspectSha,
        liveSha,
        wrapper: body,
        impact,
        control: ACTIONABLE,
      });
      assert.equal(verdict.wrongReceipt, false, JSON.stringify(verdict));
      assert.ok(verdict.kind === KIND.FROZEN_CONSUMED || verdict.kind === KIND.ACCURATE_REFUSE);
      assert.equal(verdict.productAccepted, true);
      if (verdict.kind === KIND.FROZEN_CONSUMED) {
        assert.equal(body.analysis.status, "actionable");
        assert.equal(impact.summary, control.impact.summary);
      }
      assert.ok(body.retrieval?.id);
      const got = await fetch(`${origin}${body.retrieval.path}`);
      assert.equal(got.status, 200);
      const stored = await got.json();
      assert.equal(stored.executionId, body.executionId);
    } finally {
      child.kill("SIGTERM");
    }
  });
});
