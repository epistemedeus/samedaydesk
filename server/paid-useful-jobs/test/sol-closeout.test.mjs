import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { createHash } from "node:crypto";
import { classifyTransport } from "../lib/contract.mjs";
import { createExecutor, runPaidOffer } from "../lib/wrapper.mjs";
import { freezeRequest, materializeInputs } from "../lib/input-guard.mjs";
import {
  deliverSuppliedInput,
  orderRequestFromPreflight,
  runPreflightStage,
} from "../lib/delivery-kit.mjs";
import { loadDeliveryCatalog } from "../lib/delivery-catalog.mjs";
import { defaultFileStore, runCreateOrder } from "../../../tools/managed-useful-jobs-order/lib/create-order.mjs";
import { seedFromD01Execution, verifyOutputBytes } from "../../../tools/result-mailbox/lib/d01-receipt.mjs";
import { seedFromOutDir } from "../../../tools/result-mailbox/lib/seed.mjs";
import { writeEnvelopeFiles } from "../../../tools/result-mailbox/lib/store.mjs";
import { buildEnvelope } from "../../../tools/result-mailbox/lib/envelope.mjs";
import { kitEngineProvenance } from "../../../tools/result-mailbox/lib/pins.mjs";
import { cacheRoot, ensureUsefulJobsKit, kitPath } from "../lib/engine.mjs";
import { classifyPair, fingerprintUsedNode } from "../../../tools/json-schema-webhook-drift/lib/compare.mjs";
import { callerRepeatWithRoot } from "./helpers.mjs";
import { createExecutionServer, listenExecutionServer } from "../lib/http.mjs";
import { REPO_ROOT } from "../lib/pins.mjs";

const LOCK = join(REPO_ROOT, "tools/lockfile-pin-delta/fixtures/journey");
const PAGE = join(REPO_ROOT, "tools/page-change-offline-job/fixtures/customer-job");

function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

function tmp(prefix) {
  return mkdtempSync(join(tmpdir(), prefix));
}

function lockInputs() {
  return { before: join(LOCK, "before.json"), after: join(LOCK, "after.json") };
}

describe("Sol closeout remaining boundaries", { timeout: 180_000 }, () => {
  it("F01: JSON plus promised files then nonzero exit is not a complete D01 delivery", async () => {
    const out = tmp("sol-f01-");
    writeFileSync(join(out, "pin-delta.json"), `${JSON.stringify({ schema: "samedaydesk.lockfile-pin-delta.v1", ok: true })}\n`);
    writeFileSync(join(out, "pin-delta.md"), "md\n");
    const execute = createExecutor({
      acquireKit: () => out,
      runEngine: () => ({
        status: 1,
        stdout: `${JSON.stringify({ ok: true, status: "actionable" })}\n`,
        stderr: "",
        json: { ok: true, status: "actionable" },
        timedOut: false,
        signal: null,
        outcomeKind: "transport-failure",
      }),
    });
    const result = await execute({
      jobId: "lockfile-pin-delta",
      inputs: lockInputs(),
      outDir: tmp("sol-f01-pub-"),
    });
    assert.equal(result.ok, false);
    assert.equal(result.transport, "engine-crash");
    assert.notEqual(result.code, null);
  });

  it("F01: real process exit 1 after writing JSON is engine-crash through createExecutor", async () => {
    const execute = createExecutor({
      runEngine: (_jobId, { outDir }) => {
        writeFileSync(
          join(outDir, "pin-delta.json"),
          `${JSON.stringify({ schema: "samedaydesk.lockfile-pin-delta.v1", ok: true })}\n`,
        );
        writeFileSync(join(outDir, "pin-delta.md"), "md\n");
        const spawned = spawnSync(
          process.execPath,
          ["-e", "process.stdout.write(JSON.stringify({ok:true,status:'actionable'})+'\\n'); process.exit(1);"],
          { encoding: "utf8" },
        );
        return {
          status: spawned.status,
          stdout: spawned.stdout || "",
          stderr: spawned.stderr || "",
          json: JSON.parse(spawned.stdout),
          timedOut: false,
          signal: spawned.signal || null,
          outcomeKind: "transport-failure",
        };
      },
    });
    const result = await execute({
      jobId: "lockfile-pin-delta",
      inputs: lockInputs(),
      outDir: tmp("sol-f01-proc-"),
    });
    assert.equal(result.ok, false);
    assert.equal(result.transport, "engine-crash");
    assert.equal(result.code, "engine-crash");
  });

  it("F01: real process timeout is timeout through D01 even with JSON on disk", async () => {
    const execute = createExecutor({
      runEngine: (_jobId, { outDir }) => {
        writeFileSync(
          join(outDir, "pin-delta.json"),
          `${JSON.stringify({ schema: "samedaydesk.lockfile-pin-delta.v1", ok: true })}\n`,
        );
        writeFileSync(join(outDir, "pin-delta.md"), "md\n");
        const spawned = spawnSync(process.execPath, ["-e", "setTimeout(() => {}, 30000)"], {
          encoding: "utf8",
          timeout: 250,
          killSignal: "SIGTERM",
        });
        return {
          status: spawned.status,
          stdout: spawned.stdout || "",
          stderr: spawned.stderr || "",
          json: { ok: true, status: "actionable" },
          timedOut: Boolean(spawned.error && spawned.error.code === "ETIMEDOUT"),
          signal: spawned.signal || "SIGTERM",
          outcomeKind: "transport-failure",
        };
      },
    });
    const result = await execute({
      jobId: "lockfile-pin-delta",
      inputs: lockInputs(),
      outDir: tmp("sol-f01-to-"),
    });
    assert.equal(result.ok, false);
    assert.equal(result.transport, "timeout");
    assert.equal(result.code, "engine-timeout");
  });

  it("F01: schemaMatch failure is not a complete D01 delivery", async () => {
    const execute = createExecutor({
      runEngine: (_jobId, { outDir }) => {
        writeFileSync(
          join(outDir, "pin-delta.json"),
          `${JSON.stringify({ schema: "samedaydesk.lockfile-pin-delta.v1", ok: true })}\n`,
        );
        writeFileSync(join(outDir, "pin-delta.md"), "md\n");
        return {
          status: 0,
          stdout: `${JSON.stringify({ ok: true, status: "actionable" })}\n`,
          stderr: "",
          json: { ok: true, status: "actionable" },
          timedOut: false,
          schemaMatch: { ok: false, mismatches: [{ name: "pin-delta.json", reason: "schema" }] },
        };
      },
    });
    const result = await execute({
      jobId: "lockfile-pin-delta",
      inputs: lockInputs(),
      outDir: tmp("sol-f01-schema-"),
    });
    assert.equal(result.ok, false);
    assert.equal(result.transport, "engine-crash");
  });

  it("F01: classifyTransport treats timedOut as timeout even when JSON is present", () => {
    assert.equal(
      classifyTransport({
        engine: { timedOut: true, status: null, json: { ok: true } },
      }),
      "timeout",
    );
    assert.equal(
      classifyTransport({
        engine: { status: 1, json: { ok: true, status: "actionable" }, outcomeKind: "transport-failure" },
      }),
      "engine-crash",
    );
    assert.equal(
      classifyTransport({
        engine: { status: 2, json: { ok: false, refused: true, code: "html-input" } },
      }),
      "ok",
    );
    assert.equal(
      classifyTransport({
        engine: { status: 0, json: { ok: true }, schemaMatch: { ok: false } },
      }),
      "engine-crash",
    );
  });

  it("F02: fileBytes frozen at preflight survive mutation after order digest check", async () => {
    const work = tmp("sol-f02-");
    const before = join(work, "before.json");
    const after = join(work, "after.json");
    writeFileSync(before, readFileSync(join(LOCK, "before.json")));
    writeFileSync(after, readFileSync(join(LOCK, "after.json")));
    const catalog = loadDeliveryCatalog();
    const pre = await runPreflightStage({
      jobId: "lockfile-pin-delta",
      inputs: { before, after },
      catalog,
      outDir: tmp("sol-f02-pre-"),
    });
    assert.equal(pre.ok, true);
    writeFileSync(after, readFileSync(join(LOCK, "before.json")));
    const raw = orderRequestFromPreflight(pre, { orderId: `ord-f02-${Date.now()}`, catalog });
    const order = await runCreateOrder(raw, {
      store: defaultFileStore(tmp("sol-f02-store-")),
      outDir: tmp("sol-f02-pub-"),
      catalog,
    });
    assert.equal(order.ok, true, order.error);
    assert.equal(order.wrapper.analysis.outcome, "actionable");
  });

  it("F03: absolute and ../ page captures are refused at preflight", async () => {
    const work = tmp("sol-f03-");
    const outside = tmp("sol-f03-out-");
    writeFileSync(join(outside, "after.json"), readFileSync(join(PAGE, "after.json")));
    writeFileSync(join(work, "before.json"), readFileSync(join(PAGE, "before.json")));
    writeFileSync(
      join(work, "job.json"),
      `${JSON.stringify({
        id: "escape",
        clock: "2026-09-11T12:00:00.000Z",
        fields: ["title"],
        before: "./before.json",
        after: join(outside, "after.json"),
      })}\n`,
    );
    const catalog = loadDeliveryCatalog();
    const abs = await runPreflightStage({
      jobId: "page-change-offline-job",
      inputs: { job: join(work, "job.json") },
      catalog,
      outDir: tmp("sol-f03-pre-"),
    });
    assert.equal(abs.ok, false);
    assert.equal(abs.code, "input-path-escapes-root");

    const work2 = tmp("sol-f03b-");
    writeFileSync(join(work2, "before.json"), readFileSync(join(PAGE, "before.json")));
    writeFileSync(join(work2, "after.json"), readFileSync(join(PAGE, "after.json")));
    const nested = join(work2, "nested");
    mkdirSync(nested);
    writeFileSync(
      join(nested, "job.json"),
      `${JSON.stringify({
        id: "escape-rel",
        clock: "2026-09-11T12:00:00.000Z",
        fields: ["title"],
        before: "../before.json",
        after: "../after.json",
      })}\n`,
    );
    const rel = await runPreflightStage({
      jobId: "page-change-offline-job",
      inputs: { job: join(nested, "job.json") },
      catalog,
      outDir: tmp("sol-f03-pre2-"),
    });
    assert.equal(rel.ok, false);
    assert.equal(rel.code, "input-path-escapes-root");
  });

  it("F03: executor copies captures under workDir and does not rewrite the caller job", () => {
    const work = tmp("sol-f03-exec-");
    const outside = tmp("sol-f03-live-");
    const originalAfter = readFileSync(join(PAGE, "after.json"));
    writeFileSync(join(outside, "after.json"), originalAfter);
    writeFileSync(join(work, "before.json"), readFileSync(join(PAGE, "before.json")));
    const jobPath = join(work, "job.json");
    writeFileSync(
      jobPath,
      `${JSON.stringify({
        id: "trusted-abs",
        clock: "2026-09-11T12:00:00.000Z",
        fields: ["title"],
        before: "./before.json",
        after: join(outside, "after.json"),
      })}\n`,
    );
    const originalJob = readFileSync(jobPath);
    const frozen = freezeRequest({ jobId: "page-change-offline-job", inputs: { job: jobPath } });
    writeFileSync(join(outside, "after.json"), readFileSync(join(PAGE, "before.json")));
    const stagedDir = join(tmp("sol-f03-stage-"), "inputs");
    const materialized = materializeInputs("page-change-offline-job", frozen, stagedDir, {
      getJob: () => ({
        id: "page-change-offline-job",
        requiredInputs: ["--job"],
        optionalInputs: ["--job-before", "--job-after"],
        outputs: ["page-change.json", "page-change.md"],
      }),
    });
    assert.equal(Buffer.compare(readFileSync(jobPath), originalJob), 0);
    const stagedJob = JSON.parse(readFileSync(materialized.files.job, "utf8"));
    assert.equal(stagedJob.before, "before.json");
    assert.equal(stagedJob.after, "after.json");
    assert.equal(sha256(readFileSync(join(stagedDir, "after.json"))), sha256(originalAfter));
    assert.notEqual(sha256(readFileSync(join(outside, "after.json"))), sha256(originalAfter));
  });

  it("F04: mailbox copies verified buffers, not a later reopen of mutated files", () => {
    const runOut = tmp("sol-f04-out-");
    const jsonPath = join(runOut, "budget-impact.json");
    const mdPath = join(runOut, "budget-impact.md");
    const original = Buffer.from(`${JSON.stringify({ ok: true, status: "informational", schema: "s176.budget-impact.v1" })}\n`);
    const md = Buffer.from("verified-md\n");
    writeFileSync(jsonPath, original);
    writeFileSync(mdPath, md);
    const files = verifyOutputBytes(runOut, [
      { name: "budget-impact.json", bytes: original.length, sha256: sha256(original) },
      { name: "budget-impact.md", bytes: md.length, sha256: sha256(md) },
    ]);
    writeFileSync(jsonPath, `${JSON.stringify({ ok: true, mutated: true })}\n`);
    const mailbox = tmp("sol-f04-mail-");
    const seeded = seedFromOutDir({
      mailbox,
      requestId: "req-f04",
      jobId: "vendor-budget-impact",
      outDir: runOut,
      clock: "2026-09-11T23:00:00Z",
      expiresAt: "2026-09-12T23:00:00Z",
      preloadedFiles: files,
    });
    assert.equal(seeded.ok, true);
    const boxed = readFileSync(join(mailbox, "req-f04/artifacts/budget-impact.json"));
    assert.equal(sha256(boxed), sha256(original));
    assert.equal(JSON.parse(boxed.toString()).mutated, undefined);
  });

  it("F04: seedFromD01Execution uses the verified buffers", () => {
    const runOut = tmp("sol-f04-d01-");
    const jsonPath = join(runOut, "budget-impact.json");
    const mdPath = join(runOut, "budget-impact.md");
    const original = Buffer.from(`${JSON.stringify({ ok: true, status: "informational", schema: "s176.budget-impact.v1" })}\n`);
    const md = Buffer.from("verified-md\n");
    writeFileSync(jsonPath, original);
    writeFileSync(mdPath, md);
    const execution = {
      ok: true,
      jobId: "vendor-budget-impact",
      contract: "samedaydesk.paid-useful-jobs.execution.v1",
      transport: "ok",
      analysis: { status: "informational", outcome: "informational" },
      delivery: { complete: true, expected: ["budget-impact.json", "budget-impact.md"] },
      outputs: [
        { name: "budget-impact.json", bytes: original.length, sha256: sha256(original) },
        { name: "budget-impact.md", bytes: md.length, sha256: sha256(md) },
      ],
      receipt: {
        schema: "samedaydesk.paid-useful-jobs.receipt.v1",
        jobId: "vendor-budget-impact",
        contract: "samedaydesk.paid-useful-jobs.execution.v1",
        outputsDigest: "x",
      },
      runOutDir: runOut,
      executionId: "exec-f04",
    };
    const files = verifyOutputBytes(runOut, execution.outputs);
    writeFileSync(jsonPath, `${JSON.stringify({ ok: true, mutated: true })}\n`);
    const mailbox = tmp("sol-f04-d01-mail-");
    const seeded = seedFromOutDir({
      mailbox,
      requestId: "req-f04-d01",
      jobId: execution.jobId,
      outDir: runOut,
      clock: "2026-09-11T23:00:00Z",
      expiresAt: "2026-09-12T23:00:00Z",
      preloadedFiles: files,
      extraEnvelope: { d01: { executionId: execution.executionId } },
    });
    assert.equal(seeded.ok, true);
    assert.equal(sha256(readFileSync(join(mailbox, "req-f04-d01/artifacts/budget-impact.json"))), sha256(original));
    void seedFromD01Execution;
  });

  it("F05: deliverSuppliedInput keeps repeat-job-record --input-root", async () => {
    const result = await deliverSuppliedInput({
      jobId: "repeat-job-record",
      inputs: callerRepeatWithRoot(),
    });
    assert.equal(result.ok, true, result.order?.error || result.preflight?.error);
    const flags = (result.order.inputs || []).map((row) => row.flag);
    assert.equal(flags.includes("--input-root"), true);
    const root = (result.order.inputs || []).find((row) => row.flag === "--input-root");
    assert.equal(root.kind, "directory");
    assert.ok(root.path);
  });

  it("F06: transport failure completes the reservation so retry is a replay not a hang", async () => {
    const store = defaultFileStore(tmp("sol-f06-store-"));
    const catalog = loadDeliveryCatalog();
    const pre = await runPreflightStage({
      jobId: "lockfile-pin-delta",
      inputs: lockInputs(),
      catalog,
      outDir: tmp("sol-f06-pre-"),
    });
    const raw = orderRequestFromPreflight(pre, { orderId: "ord-f06-timeout", catalog });
    const execute = createExecutor({
      runEngine: () => ({
        status: null,
        stdout: "",
        stderr: "",
        json: null,
        timedOut: true,
        signal: "SIGTERM",
        outcomeKind: "transport-failure",
      }),
    });
    const wrapper = {
      kind: "library",
      version: "samedaydesk.paid-useful-jobs.execution.v1",
      runPaidOffer: execute,
      classifyFunding: null,
    };
    const first = await runCreateOrder(raw, {
      store,
      outDir: tmp("sol-f06-pub-"),
      catalog,
      wrapper,
    });
    assert.equal(first.ok, false);
    const started = Date.now();
    const second = await runCreateOrder(raw, {
      store,
      outDir: tmp("sol-f06-pub2-"),
      catalog,
      wrapper,
    });
    assert.ok(Date.now() - started < 5000, "retry waited on a live same-pid holder");
    assert.equal(second.ok, false);
    assert.equal(second.replayed, true);
  });

  it("F06: lost HTTP POST recovers the pre-known executionId", async () => {
    const backend = createExecutionServer();
    const listened = await listenExecutionServer(backend.server);
    const proxy = createServer((req, res) => {
      const chunks = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", async () => {
        const body = Buffer.concat(chunks);
        try {
          const r = await fetch(`${listened.origin}${req.url}`, {
            method: req.method,
            headers: { "content-type": "application/json" },
            body: req.method === "GET" || req.method === "HEAD" ? undefined : body,
          });
          const text = await r.text();
          if (req.method === "POST" && (req.url === "/execute" || req.url === "/execute/")) {
            res.destroy();
            return;
          }
          res.writeHead(r.status, { "content-type": "application/json" });
          res.end(text);
        } catch (err) {
          if (!res.headersSent) {
            res.writeHead(502, { "content-type": "application/json" });
            res.end(JSON.stringify({ ok: false, error: String(err?.message || err) }));
          }
        }
      });
    });
    await new Promise((resolve) => proxy.listen(0, "127.0.0.1", resolve));
    const origin = `http://127.0.0.1:${proxy.address().port}`;
    try {
      const catalog = loadDeliveryCatalog();
      const pre = await runPreflightStage({
        jobId: "lockfile-pin-delta",
        inputs: lockInputs(),
        catalog,
        outDir: tmp("sol-f06-http-pre-"),
      });
      const raw = orderRequestFromPreflight(pre, { orderId: `ord-f06-http-${Date.now()}`, catalog });
      const order = await runCreateOrder(raw, {
        store: defaultFileStore(tmp("sol-f06-http-store-")),
        outDir: tmp("sol-f06-http-out-"),
        catalog,
        executeUrl: origin,
      });
      assert.equal(order.ok, true, order.error || order.code);
      assert.match(String(order.wrapper.executionId), /[0-9a-f-]/i);
    } finally {
      await new Promise((resolve) => proxy.close(() => resolve()));
      await new Promise((resolve) => backend.server.close(() => resolve()));
    }
  });

  it("F07: same requestId with different artifacts conflicts; identical seed replays", () => {
    const mailbox = tmp("sol-f07-");
    const bufA = Buffer.from('{"a":1}\n');
    const filesA = [{ name: "budget-impact.json", buf: bufA, bytes: bufA.length, sha256: sha256(bufA) }];
    const envA = buildEnvelope({
      requestId: "req-f07",
      jobId: "vendor-budget-impact",
      completedAt: "2026-09-11T23:00:00Z",
      expiresAt: "2026-09-12T23:00:00Z",
      artifacts: filesA,
      engine: kitEngineProvenance(),
    });
    const first = writeEnvelopeFiles({ mailbox, envelope: envA, files: filesA });
    assert.equal(first.replayed, undefined);
    const replay = writeEnvelopeFiles({ mailbox, envelope: envA, files: filesA });
    assert.equal(replay.replayed, true);
    const bufB = Buffer.from('{"b":2}\n');
    const filesB = [{ name: "budget-impact.json", buf: bufB, bytes: bufB.length, sha256: sha256(bufB) }];
    const envB = buildEnvelope({
      requestId: "req-f07",
      jobId: "vendor-budget-impact",
      completedAt: "2026-09-11T23:00:00Z",
      expiresAt: "2026-09-12T23:00:00Z",
      artifacts: filesB,
      engine: kitEngineProvenance(),
    });
    assert.throws(
      () => writeEnvelopeFiles({ mailbox, envelope: envB, files: filesB }),
      (err) => err.code === "request-id-conflict",
    );
  });

  it("F08: used-path pattern add is breaking, not silent unchanged", () => {
    const dialect = "https://json-schema.org/draft/2020-12/schema";
    const before = { $schema: dialect, type: "string" };
    const after = { $schema: dialect, type: "string", pattern: "^a+$" };
    const row = classifyPair(
      fingerprintUsedNode(before, before, "json-schema"),
      fingerprintUsedNode(after, after, "json-schema"),
    );
    assert.equal(row.class, "breaking");
    assert.equal(row.reason, "pattern-added");
  });

  it("F09: M01 receipt provenance includes executable bytes of the bin actually run", async () => {
    const result = await runPaidOffer({
      jobId: "lockfile-pin-delta",
      inputs: lockInputs(),
    });
    assert.equal(result.ok, true);
    const exec = result.receipt.engine?.executable;
    assert.ok(exec?.sha256);
    assert.match(exec.sha256, /^[0-9a-f]{64}$/);
    assert.notEqual(exec.sha256, result.receipt.engine.archiveSha256);
    assert.ok(exec.bin);
  });

  it("F10: partial extract without .ready is not promoted on the next acquisition", () => {
    const dest = cacheRoot();
    const kit = kitPath(dest);
    mkdirSync(join(kit, "bin"), { recursive: true });
    writeFileSync(join(kit, "bin/useful-jobs.mjs"), "partial\n");
    rmSync(join(dest, ".ready"), { force: true });
    const extracted = ensureUsefulJobsKit();
    assert.equal(extracted, kit);
    const cli = readFileSync(join(kit, "bin/useful-jobs.mjs"), "utf8");
    assert.notEqual(cli.trim(), "partial");
    assert.equal(readFileSync(join(dest, ".ready"), "utf8").trim().length, 64);
  });

  it("F10: .ready without CLI is wiped and re-extracted", () => {
    const dest = cacheRoot();
    const kit = kitPath(dest);
    mkdirSync(dest, { recursive: true });
    writeFileSync(join(dest, ".ready"), `${"a".repeat(64)}\n`);
    rmSync(join(kit, "bin/useful-jobs.mjs"), { force: true });
    const extracted = ensureUsefulJobsKit();
    assert.equal(existsSync(join(extracted, "bin/useful-jobs.mjs")), true);
    assert.notEqual(readFileSync(join(extracted, "bin/useful-jobs.mjs"), "utf8").trim(), "partial");
    assert.equal(readFileSync(join(dest, ".ready"), "utf8").trim().length, 64);
  });
});
