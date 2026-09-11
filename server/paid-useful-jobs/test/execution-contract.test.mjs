import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { inspectSample } from "../lib/sample-guard.mjs";
import { createExecutor, runPaidOffer } from "../lib/wrapper.mjs";
import { runEngineJob } from "../lib/engine.mjs";
import { EXECUTION_CONTRACT_VERSION } from "../lib/contract.mjs";
import { createExecutionServer, listenExecutionServer } from "../lib/http.mjs";
import { REPO_ROOT } from "../lib/pins.mjs";
import { callerBudget, loadReservedPayment } from "./helpers.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const cli = join(here, "../bin/cli.mjs");
const serve = join(here, "../bin/serve-execution.mjs");
const before = join(here, "../fixtures/caller/vendor-budget-impact/before.json");
const after = join(here, "../fixtures/caller/vendor-budget-impact/after.json");

function writeExpected(outDir, { jsonOk = true, status = "completed" } = {}) {
  writeFileSync(join(outDir, "budget-impact.json"), `${JSON.stringify({ ok: jsonOk, synthetic: true })}\n`);
  writeFileSync(join(outDir, "budget-impact.md"), "synthetic report\n");
  return {
    status: 0,
    stdout: JSON.stringify({ ok: jsonOk, status, refused: jsonOk === false }),
    stderr: "",
    json: { ok: jsonOk, status, refused: jsonOk === false },
  };
}

describe("W5-D01 execution contract", { timeout: 180_000 }, () => {
  it("inline JSON SAMPLE string is a sample, not a reserved-fixture sale", async () => {
    const sample = inspectSample({
      inputs: { input: JSON.stringify({ label: "SAMPLE", sampleLabel: "SAMPLE" }) },
    });
    assert.equal(sample.sample, true);
    assert.ok(sample.reasons.some((r) => r.startsWith("json-sample-label:")));

    const result = await runPaidOffer({
      jobId: "evidence-ci-annotation",
      inputs: { input: JSON.stringify({ label: "SAMPLE", sampleLabel: "SAMPLE", findings: [] }) },
      fundingIntent: "reserved-fixture",
      payment: loadReservedPayment(),
    });
    assert.equal(result.ok, false);
    assert.equal(result.sold, false);
    assert.equal(result.sample, true);
    assert.equal(result.code, "sample-not-a-sale");
    assert.equal(result.fundingState, "rejected");
    assert.equal(result.transport, "rejected");
    assert.equal(result.contract, EXECUTION_CONTRACT_VERSION);
  });

  it("stale caller outDir is overwritten with this run's bytes, not claimed as delivery", async () => {
    const outDir = mkdtempSync(join(tmpdir(), "puj-stale-"));
    writeFileSync(join(outDir, "budget-impact.json"), '{"stale":true}');
    writeFileSync(join(outDir, "budget-impact.md"), "stale\n");
    const result = await runPaidOffer({
      jobId: "vendor-budget-impact",
      inputs: callerBudget(),
      outDir,
    });
    assert.equal(result.ok, true, result.error);
    assert.equal(result.delivery.complete, true);
    assert.equal(result.transport, "ok");
    assert.equal(result.outputs.length, 2);
    const json = JSON.parse(readFileSync(join(outDir, "budget-impact.json"), "utf8"));
    assert.notEqual(json.stale, true);
    assert.notEqual(readFileSync(join(outDir, "budget-impact.json"), "utf8").length, 15);
    assert.equal(result.contract, EXECUTION_CONTRACT_VERSION);
  });

  it("CLI --out-dir with stale files publishes this run, exit 0", () => {
    const outDir = mkdtempSync(join(tmpdir(), "puj-stale-cli-"));
    writeFileSync(join(outDir, "budget-impact.json"), '{"stale":true}');
    writeFileSync(join(outDir, "budget-impact.md"), "stale\n");
    const r = spawnSync(
      process.execPath,
      [
        cli,
        "run",
        "vendor-budget-impact",
        "--before",
        before,
        "--after",
        after,
        "--out-dir",
        outDir,
      ],
      { encoding: "utf8", cwd: REPO_ROOT, timeout: 120_000, maxBuffer: 8 * 1024 * 1024 },
    );
    assert.equal(r.status, 0, r.stderr + r.stdout);
    const body = JSON.parse(r.stdout);
    assert.equal(body.ok, true);
    assert.equal(body.delivery.complete, true);
    const json = JSON.parse(readFileSync(join(outDir, "budget-impact.json"), "utf8"));
    assert.notEqual(json.stale, true);
  });

  it("createExecutor acquireKit throw is kit-acquisition-failed, not uncaught", async () => {
    const execute = createExecutor({
      acquireKit() {
        throw new Error("archive missing");
      },
    });
    const result = await execute({
      jobId: "vendor-budget-impact",
      inputs: callerBudget(),
    });
    assert.equal(result.ok, false);
    assert.equal(result.code, "kit-acquisition-failed");
    assert.equal(result.transport, "acquisition-failed");
    assert.equal(result.delivery.complete, false);
    assert.equal(result.delivery.status, "not-attempted");
    assert.equal(result.sold, false);
  });

  it("engine ok without writing expected files is missing-output, not success", async () => {
    const outDir = mkdtempSync(join(tmpdir(), "puj-missing-"));
    writeFileSync(join(outDir, "budget-impact.json"), '{"stale":true}');
    writeFileSync(join(outDir, "budget-impact.md"), "stale\n");
    const execute = createExecutor({
      runEngine() {
        return {
          status: 0,
          stdout: JSON.stringify({ ok: true, status: "completed" }),
          stderr: "",
          json: { ok: true, status: "completed" },
        };
      },
    });
    const result = await execute({
      jobId: "vendor-budget-impact",
      inputs: callerBudget(),
      outDir,
    });
    assert.equal(result.ok, false);
    assert.equal(result.code, "missing-output");
    assert.equal(result.transport, "ok");
    assert.equal(result.delivery.complete, false);
    assert.ok(result.delivery.missing.includes("budget-impact.json"));
    assert.equal(JSON.parse(readFileSync(join(outDir, "budget-impact.json"), "utf8")).stale, true);
    assert.equal(
      result.outputs.some((o) => o.path === join(outDir, "budget-impact.json")),
      false,
    );
  });

  it("engine throw is engine-crash, not a delivered analysis", async () => {
    const execute = createExecutor({
      runEngine() {
        throw new Error("spawn failed");
      },
    });
    const result = await execute({
      jobId: "vendor-budget-impact",
      inputs: callerBudget(),
    });
    assert.equal(result.ok, false);
    assert.equal(result.code, "engine-crash");
    assert.equal(result.transport, "engine-crash");
    assert.equal(result.analysis.outcome, "crashed");
    assert.equal(result.outputs.length, 0);
  });

  it("missing engine JSON is engine-crash, not missing-output claimed from caller dir", async () => {
    const outDir = mkdtempSync(join(tmpdir(), "puj-crash-json-"));
    writeFileSync(join(outDir, "budget-impact.json"), '{"stale":true}');
    const execute = createExecutor({
      runEngine() {
        return { status: 1, stdout: "boom", stderr: "crash", json: null };
      },
    });
    const result = await execute({
      jobId: "vendor-budget-impact",
      inputs: callerBudget(),
      outDir,
    });
    assert.equal(result.ok, false);
    assert.equal(result.code, "engine-crash");
    assert.equal(result.transport, "engine-crash");
    assert.equal(result.outputs.length, 0);
  });

  it("timeout is timeout transport, not delivery", async () => {
    const execute = createExecutor({
      runEngine() {
        return { status: null, timedOut: true, stdout: "", stderr: "ETIMEDOUT", json: null };
      },
    });
    const result = await execute({
      jobId: "vendor-budget-impact",
      inputs: callerBudget(),
    });
    assert.equal(result.ok, false);
    assert.equal(result.code, "engine-timeout");
    assert.equal(result.transport, "timeout");
    assert.notEqual(result.delivery.status, "complete");
  });

  it("valid analysis refusal with complete artifacts is useful delivery", async () => {
    const execute = createExecutor({
      runEngine(_jobId, opts) {
        return writeExpected(opts.outDir, { jsonOk: false, status: "informational" });
      },
    });
    const result = await execute({
      jobId: "vendor-budget-impact",
      inputs: callerBudget(),
    });
    assert.equal(result.ok, true, result.error);
    assert.equal(result.transport, "ok");
    assert.equal(result.delivery.complete, true);
    assert.equal(result.analysis.outcome, "refused");
    assert.equal(result.sold, false);
  });

  it("mutated caller file after staging is not what the engine consumes", async () => {
    const work = mkdtempSync(join(tmpdir(), "puj-mutate-"));
    const srcBefore = join(work, "before.json");
    const srcAfter = join(work, "after.json");
    writeFileSync(srcBefore, readFileSync(before));
    writeFileSync(srcAfter, readFileSync(after));
    const original = readFileSync(srcBefore);
    let seen = null;
    const execute = createExecutor({
      runEngine(jobId, opts) {
        seen = readFileSync(opts.files.before);
        writeFileSync(srcBefore, '{"mutated":true}\n');
        return runEngineJob(jobId, opts);
      },
    });
    const result = await execute({
      jobId: "vendor-budget-impact",
      inputs: { before: srcBefore, after: srcAfter },
    });
    assert.equal(result.ok, true, result.error);
    assert.deepEqual(seen, original);
    assert.equal(JSON.parse(readFileSync(srcBefore, "utf8")).mutated, true);
  });

  it("local HTTP POST /execute then GET /results/:id retrieves the same execution", async () => {
    const { server } = createExecutionServer();
    const { origin } = await listenExecutionServer(server);
    try {
      const health = await fetch(`${origin}/health`);
      assert.equal(health.status, 200);
      const healthBody = await health.json();
      assert.equal(healthBody.contract, EXECUTION_CONTRACT_VERSION);

      const posted = await fetch(`${origin}/execute`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jobId: "vendor-budget-impact",
          inputs: callerBudget(),
        }),
      });
      assert.equal(posted.status, 200);
      const body = await posted.json();
      assert.equal(body.ok, true, body.error);
      assert.equal(body.contract, EXECUTION_CONTRACT_VERSION);
      assert.ok(body.retrieval?.id);
      assert.equal(existsSync(body.outputs.find((o) => o.name === "budget-impact.json").path), true);

      const got = await fetch(`${origin}${body.retrieval.path}`);
      assert.equal(got.status, 200);
      const stored = await got.json();
      assert.equal(stored.executionId, body.executionId);
      assert.equal(stored.ok, true);
      assert.equal(stored.outputs.length, body.outputs.length);
    } finally {
      server.close();
    }
  });

  it("serve-execution.mjs process binds loopback and answers /health", async () => {
    const child = spawn(process.execPath, [serve], {
      cwd: REPO_ROOT,
      env: { ...process.env, HOST: "127.0.0.1", PORT: "0" },
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
      child.stderr.on("data", () => {});
      child.on("error", reject);
      child.on("exit", (code) => {
        if (code) reject(new Error(`serve-execution exited ${code}`));
      });
    });
    try {
      const health = await fetch(`${origin}/health`);
      assert.equal(health.status, 200);
      const body = await health.json();
      assert.equal(body.ok, true);
      assert.equal(body.contract, EXECUTION_CONTRACT_VERSION);
    } finally {
      child.kill("SIGTERM");
    }
  });
});
