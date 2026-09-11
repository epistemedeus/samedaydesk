import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import http from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { BIND, KIND, REFUSE_CODE, contractRecord } from "../lib/contract.mjs";
import { REPO_ROOT, TESTED_WRAPPER_SHA } from "../lib/paths.mjs";
import { sha256File } from "../../../../server/paid-useful-jobs/lib/digest.mjs";
import { runRace, spawnPaidCli } from "../lib/race.mjs";
import { stageNoChangeBudget, stageRepeatRoot, stageVendorBudget, writeSibling } from "./helpers.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const bin = join(here, "../bin/d15-race.mjs");

function spawnRaceCli(argv, timeoutMs = 120_000) {
  return spawnSync(process.execPath, [bin, ...argv], {
    encoding: "utf8",
    cwd: REPO_ROOT,
    timeout: timeoutMs,
    maxBuffer: 8 * 1024 * 1024,
  });
}

function parseCli(r) {
  assert.equal(r.signal, null, r.stderr || r.stdout);
  const text = String(r.stdout || "").trim();
  assert.ok(text, `empty stdout; stderr=${r.stderr}`);
  return JSON.parse(text);
}

function postJson(url, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = http.request(
      {
        hostname: u.hostname,
        port: u.port,
        path: u.pathname,
        method: "POST",
        headers: { "content-type": "application/json" },
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString("utf8")) });
          } catch (err) {
            reject(err);
          }
        });
      },
    );
    req.on("error", reject);
    req.write(JSON.stringify(body));
    req.end();
  });
}

function startListenProcess() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [bin, "listen", "--host", "127.0.0.1", "--port", "0"], {
      cwd: REPO_ROOT,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`listen timeout stdout=${stdout} stderr=${stderr}`));
    }, 20_000);
    child.stderr.on("data", (c) => {
      stderr += c.toString("utf8");
    });
    child.stdout.on("data", (c) => {
      stdout += c.toString("utf8");
      const line = stdout.trim().split("\n")[0];
      try {
        const meta = JSON.parse(line);
        if (meta.url) {
          clearTimeout(timer);
          resolve({ child, meta });
        }
      } catch {
        /* wait for full JSON line */
      }
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("exit", (status) => {
      if (!stdout.includes('"url"')) {
        clearTimeout(timer);
        reject(new Error(`listen exited ${status} stderr=${stderr}`));
      }
    });
  });
}

describe("W5-D15 input/execute race harness", { timeout: 180_000 }, () => {
  it("control: frozen vendor-budget-impact through paid CLI stays actionable", async () => {
    const staged = stageVendorBudget();
    const result = await runRace({
      jobId: "vendor-budget-impact",
      inputs: { before: staged.before, after: staged.after },
      bind: BIND.FROZEN,
    });
    assert.equal(result.kind, KIND.FROZEN_CONSUMED, result.error);
    assert.equal(result.engineInvoked, true);
    assert.equal(result.sold, false);
    assert.equal(result.domain.status, "actionable");
    assert.equal(result.wrapper.ok, true);
    assert.equal(existsSync(join(result.outDir, "budget-impact.json")), true);
    assert.equal(result.contract.testedImplementation.sha, TESTED_WRAPPER_SHA);
  });

  it("mutate after preflight: frozen bind consumes freeze bytes, not the live mutation", async () => {
    const staged = stageVendorBudget();
    const control = await runRace({
      jobId: "vendor-budget-impact",
      inputs: { before: staged.before, after: staged.after },
      bind: BIND.FROZEN,
    });
    const raced = await runRace({
      jobId: "vendor-budget-impact",
      inputs: { before: staged.before, after: staged.after },
      bind: BIND.FROZEN,
      mutate: { key: "after", mode: "identical-before" },
    });
    const freezeSha = raced.freeze.after.sha256;
    const liveSha = sha256File(staged.after);
    assert.notEqual(freezeSha, liveSha);
    assert.equal(raced.kind, KIND.FROZEN_CONSUMED, raced.error);
    assert.equal(raced.engineInvoked, true);
    assert.equal(raced.domain.digest, control.domain.digest);
    assert.equal(raced.domain.status, "actionable");
    assert.equal(raced.wrapper.receipt.inputs.find((i) => i.name === "after").sha256, freezeSha);
    assert.notEqual(raced.wrapper.receipt.inputs.find((i) => i.name === "after").sha256, liveSha);
  });

  it("mutate after preflight: verify-live refuses without invoking the engine", async () => {
    const staged = stageVendorBudget();
    const r = spawnRaceCli([
      "run",
      "vendor-budget-impact",
      "--before",
      staged.before,
      "--after",
      staged.after,
      "--bind",
      BIND.VERIFY_LIVE,
      "--mutate-after",
      "after",
      "--mutate-mode",
      "identical-before",
      "--out-dir",
      join(staged.work, "out"),
    ]);
    const body = parseCli(r);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(body.kind, KIND.ACCURATE_REFUSE);
    assert.equal(body.code, REFUSE_CODE);
    assert.equal(body.engineInvoked, false);
    assert.equal(body.wrapper, null);
    assert.equal(existsSync(join(staged.work, "out", "budget-impact.json")), false);
    assert.equal(body.sold, false);
  });

  it("live-observe on SDS52 aliases the caller path and consumes mutated bytes", async () => {
    const staged = stageVendorBudget();
    const control = await runRace({
      jobId: "vendor-budget-impact",
      inputs: { before: staged.before, after: staged.after },
      bind: BIND.FROZEN,
    });
    const observed = await runRace({
      jobId: "vendor-budget-impact",
      inputs: { before: staged.before, after: staged.after },
      bind: BIND.LIVE_OBSERVE,
      mutate: { key: "after", mode: "identical-before" },
    });
    assert.equal(observed.kind, KIND.RACE_CONSUMED_MUTATED);
    assert.equal(observed.engineInvoked, true);
    assert.notEqual(observed.domain.digest, control.domain.digest);
    const noChange = stageNoChangeBudget();
    const noChangeRun = await runRace({
      jobId: "vendor-budget-impact",
      inputs: { before: noChange.before, after: noChange.after },
      bind: BIND.FROZEN,
    });
    assert.equal(observed.domain.status, "informational");
    assert.equal(observed.domain.digest, noChangeRun.domain.digest);
    assert.notEqual(observed.domain.digest, control.domain.digest);
    assert.equal(
      observed.wrapper.receipt.inputs.find((i) => i.name === "after").sha256,
      sha256File(staged.after),
    );
    assert.notEqual(observed.wrapper.receipt.inputs.find((i) => i.name === "after").sha256, observed.freeze.after.sha256);
  });

  it("valid no-change analysis is not a refuse or engine failure", async () => {
    const staged = stageNoChangeBudget();
    const r = spawnRaceCli([
      "run",
      "vendor-budget-impact",
      "--before",
      staged.before,
      "--after",
      staged.after,
      "--bind",
      BIND.FROZEN,
    ]);
    const body = parseCli(r);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(body.kind, KIND.FROZEN_CONSUMED);
    assert.equal(body.wrapper.ok, true);
    assert.equal(body.domain.status, "informational");
    assert.notEqual(body.kind, KIND.ENGINE_FAILURE);
    assert.notEqual(body.kind, KIND.ACCURATE_REFUSE);
  });

  it("unknown job is a wrapper refuse, not transport or engine failure", async () => {
    const staged = stageVendorBudget();
    const spawned = spawnPaidCli({
      jobId: "not-a-real-job",
      inputs: { before: staged.before, after: staged.after },
      outDir: join(staged.work, "out"),
    });
    assert.equal(spawned.transport.failure, false, spawned.transport.error);
    assert.equal(spawned.wrapper.ok, false);
    assert.equal(spawned.wrapper.code, "unknown-job");
    assert.equal(spawned.status, 2);
    const classified = await runRace({
      jobId: "not-a-real-job",
      inputs: { before: staged.before, after: staged.after },
      bind: BIND.FROZEN,
    });
    assert.equal(classified.kind, KIND.WRAPPER_REFUSE);
    assert.equal(classified.code, "unknown-job");
    assert.notEqual(classified.kind, KIND.ENGINE_FAILURE);
    assert.notEqual(classified.kind, KIND.TRANSPORT_FAILURE);
  });

  it("HTTP process freeze-or-refuse matches the CLI bind", async () => {
    const frozenStage = stageVendorBudget();
    const refuseStage = stageVendorBudget();
    const { child, meta } = await startListenProcess();
    try {
      const frozen = await postJson(`${meta.url}/race`, {
        jobId: "vendor-budget-impact",
        inputs: { before: frozenStage.before, after: frozenStage.after },
        bind: BIND.FROZEN,
        mutate: { key: "after", mode: "identical-before" },
      });
      assert.equal(frozen.status, 200);
      assert.equal(frozen.body.kind, KIND.FROZEN_CONSUMED);
      assert.equal(frozen.body.domain.status, "actionable");
      const refused = await postJson(`${meta.url}/race`, {
        jobId: "vendor-budget-impact",
        inputs: { before: refuseStage.before, after: refuseStage.after },
        bind: BIND.VERIFY_LIVE,
        mutate: { key: "after", mode: "identical-before" },
      });
      assert.equal(refused.status, 200);
      assert.equal(refused.body.kind, KIND.ACCURATE_REFUSE);
      assert.equal(refused.body.engineInvoked, false);
    } finally {
      child.kill("SIGTERM");
    }
  });

  it("unrelated sibling mutation does not change frozen execute", async () => {
    const staged = stageVendorBudget();
    const control = await runRace({
      jobId: "vendor-budget-impact",
      inputs: { before: staged.before, after: staged.after },
      bind: BIND.FROZEN,
    });
    writeSibling(staged.work, "note.txt", "unrelated sibling bytes\n");
    const raced = await runRace({
      jobId: "vendor-budget-impact",
      inputs: { before: staged.before, after: staged.after },
      bind: BIND.FROZEN,
    });
    assert.equal(raced.kind, KIND.FROZEN_CONSUMED);
    assert.equal(raced.domain.digest, control.domain.digest);
  });

  it("repeat-job input-root freeze keeps identity when the live tree mutates", async () => {
    const frozenStage = stageRepeatRoot();
    const observeStage = stageRepeatRoot();
    const control = await runRace({
      jobId: "repeat-job-record",
      inputs: { "next-run": frozenStage.nextRun, "input-root": frozenStage.inputRoot },
      bind: BIND.FROZEN,
    });
    assert.equal(control.wrapper.ok, true, control.error);
    assert.equal(control.wrapper.engine.identityVerified, true);
    const raced = await runRace({
      jobId: "repeat-job-record",
      inputs: { "next-run": frozenStage.nextRun, "input-root": frozenStage.inputRoot },
      bind: BIND.FROZEN,
      mutate: { key: "input-root", mode: "identical-before", rel: "after.json" },
    });
    assert.equal(raced.kind, KIND.FROZEN_CONSUMED, raced.error);
    assert.equal(raced.wrapper.engine.identityVerified, true);
    const observed = await runRace({
      jobId: "repeat-job-record",
      inputs: { "next-run": observeStage.nextRun, "input-root": observeStage.inputRoot },
      bind: BIND.LIVE_OBSERVE,
      mutate: { key: "input-root", mode: "identical-before", rel: "after.json" },
    });
    assert.equal(observed.wrapper.ok, false);
    assert.notEqual(observed.wrapper.engine?.identityVerified, true);
  });

  it("contract CLI names the tested wrapper sha and remaining D01 bind", () => {
    const r = spawnRaceCli(["contract"]);
    const body = parseCli(r);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(body.testedImplementation.sha, TESTED_WRAPPER_SHA);
    assert.equal(body.integrationOwner, "W5-D01");
    assert.equal(body.refuseCode, REFUSE_CODE);
    assert.deepEqual(body, contractRecord());
  });
});
