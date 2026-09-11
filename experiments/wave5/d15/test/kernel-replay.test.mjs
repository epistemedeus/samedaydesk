import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { describe, it } from "node:test";
import { KIND } from "../lib/contract.mjs";
import {
  D01_SHA,
  EXECUTION_CONTRACT_VERSION,
  ensureKernelRoot,
  kernelServe,
} from "../lib/kernels.mjs";
import {
  classifyKernelRace,
  d01ConcurrentOutDir,
  d01NoChangeControl,
  d01PostMaterializeLibrary,
  replayKernelCli,
  sds52MutateThenCall,
  stageKernelBudget,
} from "../lib/kernel-race.mjs";

const ACTIONABLE = {
  status: "actionable",
  summary: "Budget-impact scan: fieldChanges=2 unitChanges=0 conflicting=0 unknown=0",
};

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

  it("D01 execution.v1 post-materialize mutate uses staged bytes and matching receipt", async () => {
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
    assert.equal(existsSync(lib.result.outputs.find((o) => o.name === "budget-impact.json").path), true);
  });

  it("D01 CLI after-copy preload freezes execute bytes (process, not shim)", () => {
    const root = ensureKernelRoot(D01_SHA);
    const replay = replayKernelCli(root, { window: "after-copy" });
    assert.equal(replay.spawned.transportFailure, false, replay.spawned.stderr);
    assert.equal(replay.flag?.window, "after-materialize-copy");
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
    assert.match(String(replay.enginePath), /\/inputs\/after\.json$/);
  });

  it("D01 inspect-to-materialize window still consumes mutated bytes", () => {
    const root = ensureKernelRoot(D01_SHA);
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

  it("D01 concurrent caller outDir keeps isolated run dirs and last-writer publishes", async () => {
    const run = await d01ConcurrentOutDir();
    assert.equal(run.changed.ok, true, run.changed.error);
    assert.equal(run.quiet.ok, true, run.quiet.error);
    assert.equal(run.aliasExposed, true);
    assert.equal(run.changedIsolated.status, "actionable");
    assert.equal(run.quietIsolated.status, "informational");
    assert.ok(run.publishedMatchesChanged || run.publishedMatchesQuiet);
    assert.notEqual(run.changed.receipt.outputsDigest, run.quiet.receipt.outputsDigest);
    assert.equal(
      JSON.parse(readFileSync(run.changed.outputs.find((o) => o.name === "budget-impact.json").path, "utf8")).status,
      run.published.status,
    );
  });

  it("D01 HTTP /execute then /health uses execution.v1 without the freeze shim", async () => {
    const root = ensureKernelRoot(D01_SHA);
    const staged = stageKernelBudget(root);
    const child = spawn(process.execPath, [kernelServe(root)], {
      cwd: root,
      env: { ...process.env, HOST: "127.0.0.1", PORT: "0" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const origin = await new Promise((resolve, reject) => {
      let buf = "";
      const timer = setTimeout(() => reject(new Error("serve-execution produced no origin")), 15_000);
      child.stdout.on("data", (chunk) => {
        buf += chunk.toString("utf8");
        const nl = buf.indexOf("\n");
        if (nl >= 0) {
          clearTimeout(timer);
          try {
            resolve(JSON.parse(buf.slice(0, nl)).origin);
          } catch (err) {
            reject(err);
          }
        }
      });
      child.on("error", reject);
      child.on("exit", (code) => {
        if (code) reject(new Error(`serve-execution exited ${code}`));
      });
    });
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
      assert.equal(body.analysis.status, "actionable");
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
