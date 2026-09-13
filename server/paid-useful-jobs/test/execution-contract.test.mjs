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
import { createJobLookup, JOBS } from "../lib/jobs.mjs";
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
      inputs: { input: JSON.stringify({ schema: "s137.consumer-evidence.packet.v1", label: "SAMPLE", sampleLabel: "SAMPLE", findings: [] }) },
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

  it("HTTP result retrieval is bound to the execute Authorization principal", async () => {
    const { server } = createExecutionServer();
    const { origin } = await listenExecutionServer(server);
    try {
      const posted = await fetch(`${origin}/execute`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer cw65-synthetic-principal-a" },
        body: JSON.stringify({
          jobId: "vendor-budget-impact",
          executionId: "cw65-principal-unit",
          inputs: callerBudget(),
        }),
      });
      assert.equal(posted.status, 200);
      const body = await posted.json();
      assert.equal(body.ok, true, body.error);
      const foreign = await fetch(`${origin}/results/cw65-principal-unit`, {
        headers: { authorization: "Bearer cw65-synthetic-principal-b" },
      });
      assert.equal(foreign.status, 403);
      const foreignBody = await foreign.json();
      assert.equal(foreignBody.code, "principal-mismatch");
      const owner = await fetch(`${origin}/results/cw65-principal-unit`, {
        headers: { authorization: "Bearer cw65-synthetic-principal-a" },
      });
      assert.equal(owner.status, 200);
      assert.equal((await owner.json()).executionId, "cw65-principal-unit");
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

  it("request inputs getter is evaluated once; live mutate on later reads is not executed", async () => {
    const work = mkdtempSync(join(tmpdir(), "puj-getter-"));
    const srcBefore = join(work, "before.json");
    const srcAfter = join(work, "after.json");
    writeFileSync(srcBefore, readFileSync(before));
    writeFileSync(srcAfter, readFileSync(after));
    const original = readFileSync(srcBefore);
    const { sha256Bytes } = await import("../lib/digest.mjs");
    const originalSha = sha256Bytes(original);
    let reads = 0;
    const request = {
      jobId: "vendor-budget-impact",
      get inputs() {
        reads += 1;
        if (reads > 1) {
          writeFileSync(
            srcBefore,
            `${JSON.stringify({
              label: "MUTATED-AFTER-INSPECT",
              rows: [{ field: "desk-chat-input", value: 99, unit: "USD/1M-tokens" }],
            })}\n`,
          );
        }
        return { before: srcBefore, after: srcAfter };
      },
    };
    const result = await runPaidOffer(request);
    assert.equal(result.ok, true, result.error);
    assert.equal(reads, 1);
    assert.equal(result.receipt.inputs.find((i) => i.name === "before").sha256, originalSha);
    assert.equal(JSON.parse(readFileSync(srcBefore, "utf8")).label, "caller");
  });

  it("second getter path is not the executed input", async () => {
    const work = mkdtempSync(join(tmpdir(), "puj-getter-path-"));
    const first = join(work, "first.json");
    const second = join(work, "second.json");
    const srcAfter = join(work, "after.json");
    writeFileSync(first, readFileSync(before));
    writeFileSync(
      second,
      `${JSON.stringify({
        label: "SECOND-PATH",
        rows: [{ field: "desk-chat-input", value: 99, unit: "USD/1M-tokens" }],
      })}\n`,
    );
    writeFileSync(srcAfter, readFileSync(after));
    const { sha256Bytes } = await import("../lib/digest.mjs");
    const firstSha = sha256Bytes(readFileSync(first));
    let reads = 0;
    const result = await runPaidOffer({
      jobId: "vendor-budget-impact",
      get inputs() {
        reads += 1;
        return reads === 1
          ? { before: first, after: srcAfter }
          : { before: second, after: srcAfter };
      },
    });
    assert.equal(result.ok, true, result.error);
    assert.equal(reads, 1);
    assert.equal(result.receipt.inputs.find((i) => i.name === "before").sha256, firstSha);
  });

  it("live filesystem change after input snapshot is not executed", async () => {
    const work = mkdtempSync(join(tmpdir(), "puj-fs-race-"));
    const srcBefore = join(work, "before.json");
    const srcAfter = join(work, "after.json");
    const published = mkdtempSync(join(tmpdir(), "puj-fs-out-"));
    writeFileSync(srcBefore, readFileSync(before));
    writeFileSync(srcAfter, readFileSync(after));
    const { sha256Bytes } = await import("../lib/digest.mjs");
    const originalSha = sha256Bytes(readFileSync(srcBefore));
    const result = await runPaidOffer({
      jobId: "vendor-budget-impact",
      inputs: { before: srcBefore, after: srcAfter },
      get outDir() {
        writeFileSync(
          srcBefore,
          `${JSON.stringify({
            label: "MUTATED-AFTER-SNAPSHOT",
            rows: [{ field: "desk-chat-input", value: 99, unit: "USD/1M-tokens" }],
          })}\n`,
        );
        return published;
      },
    });
    assert.equal(result.ok, true, result.error);
    assert.equal(result.receipt.inputs.find((i) => i.name === "before").sha256, originalSha);
    assert.equal(JSON.parse(readFileSync(srcBefore, "utf8")).label, "MUTATED-AFTER-SNAPSHOT");
  });

  it("shared caller outDir: receipt describes this runOutDir, not another writer's publication", async () => {
    const shared = mkdtempSync(join(tmpdir(), "puj-alias-"));
    const work = mkdtempSync(join(tmpdir(), "puj-alias-in-"));
    const beforeA = join(work, "before.json");
    const afterA = join(work, "after-a.json");
    const afterB = join(work, "after-b.json");
    writeFileSync(beforeA, readFileSync(before));
    writeFileSync(afterA, readFileSync(after));
    const afterBBody = JSON.parse(readFileSync(after, "utf8"));
    afterBBody.rows = afterBBody.rows.map((row) =>
      row.field === "desk-chat-output" ? { ...row, value: 99 } : row,
    );
    writeFileSync(afterB, `${JSON.stringify(afterBBody, null, 2)}\n`);

    const execute = createExecutor({
      runEngine(_jobId, opts) {
        const marker = readFileSync(opts.files.after, "utf8");
        writeFileSync(join(opts.outDir, "budget-impact.json"), `${JSON.stringify({ marker })}\n`);
        writeFileSync(join(opts.outDir, "budget-impact.md"), marker);
        return {
          status: 0,
          stdout: JSON.stringify({ ok: true, status: "informational" }),
          stderr: "",
          json: { ok: true, status: "informational" },
        };
      },
    });

    const [a, b] = await Promise.all([
      execute({ jobId: "vendor-budget-impact", inputs: { before: beforeA, after: afterA }, outDir: shared }),
      execute({ jobId: "vendor-budget-impact", inputs: { before: beforeA, after: afterB }, outDir: shared }),
    ]);
    assert.equal(a.ok, true, a.error);
    assert.equal(b.ok, true, b.error);
    assert.equal(a.analysis.outcome, "informational");
    assert.notEqual(a.receipt.outputsDigest, b.receipt.outputsDigest);
    assert.ok(a.outputs[0].path.startsWith(a.runOutDir));
    assert.ok(b.outputs[0].path.startsWith(b.runOutDir));

    writeFileSync(join(shared, "budget-impact.json"), '{"foreign":true}\n');
    writeFileSync(join(shared, "budget-impact.md"), "foreign\n");
    const { sha256File } = await import("../lib/digest.mjs");
    const publishedJsonSha = sha256File(join(shared, "budget-impact.json"));
    const aJson = a.receipt.outputs.find((o) => o.name === "budget-impact.json");
    const bJson = b.receipt.outputs.find((o) => o.name === "budget-impact.json");
    assert.notEqual(aJson.sha256, publishedJsonSha);
    assert.notEqual(bJson.sha256, publishedJsonSha);
    assert.equal(sha256File(aJson.path), aJson.sha256);
    assert.equal(sha256File(bJson.path), bJson.sha256);
  });

  it("two CLI processes sharing --out-dir keep distinct run receipts", async () => {
    const shared = mkdtempSync(join(tmpdir(), "puj-cli-alias-"));
    const work = mkdtempSync(join(tmpdir(), "puj-cli-alias-in-"));
    const afterA = join(work, "after-a.json");
    const afterB = join(work, "after-b.json");
    writeFileSync(afterA, readFileSync(after));
    const afterBBody = JSON.parse(readFileSync(after, "utf8"));
    afterBBody.rows = afterBBody.rows.map((row) =>
      row.field === "desk-chat-output" ? { ...row, value: 99 } : row,
    );
    writeFileSync(afterB, `${JSON.stringify(afterBBody, null, 2)}\n`);

    const spawnOne = (afterPath) =>
      new Promise((resolve, reject) => {
        const child = spawn(
          process.execPath,
          [cli, "run", "vendor-budget-impact", "--before", before, "--after", afterPath, "--out-dir", shared],
          { cwd: REPO_ROOT, timeout: 120_000 },
        );
        let stdout = "";
        let stderr = "";
        child.stdout.on("data", (c) => {
          stdout += c.toString("utf8");
        });
        child.stderr.on("data", (c) => {
          stderr += c.toString("utf8");
        });
        child.on("error", reject);
        child.on("close", (status) => resolve({ status, stdout, stderr }));
      });

    const [ra, rb] = await Promise.all([spawnOne(afterA), spawnOne(afterB)]);
    assert.equal(ra.status, 0, ra.stderr + ra.stdout);
    assert.equal(rb.status, 0, rb.stderr + rb.stdout);
    const a = JSON.parse(ra.stdout);
    const b = JSON.parse(rb.stdout);
    assert.equal(a.ok, true, a.error);
    assert.equal(b.ok, true, b.error);
    assert.equal(a.contract, EXECUTION_CONTRACT_VERSION);
    assert.notEqual(a.receipt.outputsDigest, b.receipt.outputsDigest);
    assert.ok(a.outputs.every((o) => o.path.startsWith(a.runOutDir)));
    assert.ok(b.outputs.every((o) => o.path.startsWith(b.runOutDir)));
  });

  it("schema-invalid vendor-budget rows are refused at service entry, not useful", async () => {
    const work = mkdtempSync(join(tmpdir(), "puj-schema-"));
    const bad = join(work, "before.json");
    writeFileSync(bad, `${JSON.stringify({ hello: "world" })}\n`);
    const result = await runPaidOffer({
      jobId: "vendor-budget-impact",
      inputs: { before: bad, after },
    });
    assert.equal(result.ok, false);
    assert.equal(result.code, "input-schema-mismatch");
    assert.equal(result.transport, "rejected");
    assert.equal(result.sold, false);
    assert.equal(result.delivery.complete, false);
  });

  it("CLI schema-invalid pricing JSON is not a useful delivery", () => {
    const work = mkdtempSync(join(tmpdir(), "puj-schema-cli-"));
    const bad = join(work, "before.json");
    writeFileSync(bad, `${JSON.stringify({ hello: "world" })}\n`);
    const r = spawnSync(
      process.execPath,
      [cli, "run", "vendor-budget-impact", "--before", bad, "--after", after],
      { encoding: "utf8", cwd: REPO_ROOT, timeout: 30_000, maxBuffer: 8 * 1024 * 1024 },
    );
    assert.equal(r.status, 2);
    const body = JSON.parse(r.stdout);
    assert.equal(body.code, "input-schema-mismatch");
    assert.equal(body.ok, false);
  });

  it("createExecutor catalog/getJob injection still overrides the default overlay", async () => {
    const lookup = createJobLookup({ jobs: JOBS.map((j) => ({ ...j })) });
    let seen = null;
    const execute = createExecutor({
      getJob(id) {
        seen = id;
        return lookup.getJob(id);
      },
      runEngine(_jobId, opts) {
        return writeExpected(opts.outDir);
      },
    });
    const result = await execute({
      jobId: "vendor-budget-impact",
      inputs: callerBudget(),
    });
    assert.equal(seen, "vendor-budget-impact");
    assert.equal(result.ok, true, result.error);
    assert.equal(existsSync(join(result.runOutDir, "receipt.json")), true);
  });

  it("createExecutor({ catalog }) is enough without a getJob function", async () => {
    const execute = createExecutor({
      catalog: { jobs: JOBS.map((j) => ({ ...j })) },
      runEngine(_jobId, opts) {
        return writeExpected(opts.outDir);
      },
    });
    const result = await execute({
      jobId: "vendor-budget-impact",
      inputs: callerBudget(),
    });
    assert.equal(result.ok, true, result.error);
    assert.equal(result.contract, EXECUTION_CONTRACT_VERSION);
    assert.equal(existsSync(join(result.runOutDir, "receipt.json")), true);
  });
});
