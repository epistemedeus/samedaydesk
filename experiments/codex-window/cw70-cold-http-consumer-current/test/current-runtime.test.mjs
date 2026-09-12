import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import http from "node:http";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { createExecutionServer, listenExecutionServer } from "../../../../server/paid-useful-jobs/lib/http.mjs";
import { classifyHttpExchange, getHealth, getResult, postExecute } from "../../../wave5/d14/lib/client.mjs";
import { D14_DIR, EXECUTION_CONTRACT_VERSION, RUNTIME_PIN } from "../../../wave5/d14/lib/pins.mjs";
import { spawnExecutionHttp } from "../../../wave5/d14/test/spawn-d01.mjs";
import {
  closeServer,
  paymentPath,
  runCli,
  runCliAsync,
  spawnCli,
  tmpWork,
  uniquePair,
} from "../../../wave5/d14/test/helpers.mjs";

function startDropPostProxy(targetOrigin) {
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const body = Buffer.concat(chunks);
      const dest = new URL(req.url || "/", targetOrigin);
      const headers = { "content-type": req.headers["content-type"] || "application/json" };
      if (body.length) headers["content-length"] = String(body.length);
      const fwd = http.request(dest, { method: req.method, headers }, (up) => {
        const bufs = [];
        up.on("data", (c) => bufs.push(c));
        up.on("end", () => {
          if (req.method === "POST") {
            res.destroy();
            return;
          }
          res.writeHead(up.statusCode, { "content-type": up.headers["content-type"] || "application/json" });
          res.end(Buffer.concat(bufs));
        });
      });
      fwd.on("error", () => res.destroy());
      fwd.end(body);
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      resolve({ server, origin: `http://127.0.0.1:${addr.port}` });
    });
  });
}

function submitArgs(origin, pair, ticketPath, executionId) {
  const args = [
    "submit",
    "--base",
    origin,
    "--job",
    "vendor-budget-impact",
    "--before",
    pair.beforePath,
    "--after",
    pair.afterPath,
    "--ticket",
    ticketPath,
  ];
  if (executionId) args.push("--execution-id", executionId);
  return args;
}

describe("CW70 cold CURRENT runtime via in-tree serve-execution.mjs", { timeout: 240_000 }, () => {
  const runtime = spawnExecutionHttp();
  after(() => runtime.stop());

  it("health names execution.v1 on pin 6007fcfa / 1.4.3", async () => {
    const origin = await runtime.originPromise;
    const health = await getHealth(origin);
    assert.equal(health.status, 200);
    assert.equal(health.body.ok, true);
    assert.equal(health.body.contract, EXECUTION_CONTRACT_VERSION);
    assert.equal(runtime.pin, RUNTIME_PIN);
  });

  it("changed-input oracle: separate submit/fetch processes, freeze, remote unsupported, local acquire", async () => {
    const origin = await runtime.originPromise;
    const pair = uniquePair();
    const sender = tmpWork("cw70-send-");
    const fetcher = tmpWork("cw70-fetch-");
    const tickets = tmpWork("cw70-tix-");
    const executionId = `cw70-changed-${pair.nonce}`.slice(0, 128);
    const ticketPath = join(tickets, "ticket.json");
    const submit = runCli(submitArgs(origin, pair, ticketPath, executionId), { cwd: sender });
    assert.equal(submit.status, 0, submit.stderr + submit.stdout);
    const submitBody = JSON.parse(submit.stdout);
    assert.equal(submitBody.classify.kind, "analysis-outcome");
    assert.equal(submitBody.ticket.executionId, executionId);
    assert.equal(submitBody.ticket.retrieval.path, `/results/${executionId}`);

    writeFileSync(pair.beforePath, '{"mutated":true}\n');
    writeFileSync(pair.afterPath, '{"mutated":true}\n');

    const outPath = join(fetcher, "fetched.json");
    const fetchProc = runCli(["fetch", "--ticket", ticketPath, "--out", outPath], { cwd: fetcher });
    assert.equal(fetchProc.status, 0, fetchProc.stderr + fetchProc.stdout);
    const fetchBody = JSON.parse(fetchProc.stdout);
    assert.equal(fetchBody.classify.kind, "analysis-outcome");
    assert.equal(fetchBody.acquisition.code, "unsupported-portable-acquisition");
    assert.equal(fetchBody.httpArtifactsDelivered, false);
    const fetched = JSON.parse(readFileSync(outPath, "utf8"));
    assert.equal(fetched.result.executionId, executionId);
    assert.equal(fetched.result.sold, false);
    assert.equal(fetched.result.contract, EXECUTION_CONTRACT_VERSION);
    assert.equal(fetched.httpArtifactsDelivered, false);
    const hostJson = fetched.result.outputs.find((o) => o.name === "budget-impact.json")?.path;
    const hostMd = fetched.result.outputs.find((o) => o.name === "budget-impact.md")?.path;
    assert.equal(typeof hostJson, "string");

    const denied = spawnSync(
      process.execPath,
      [
        "--permission",
        `--allow-fs-read=${D14_DIR}`,
        `--allow-fs-read=${fetcher}/`,
        "--allow-fs-write=/tmp/h7/runtime-tmp/cw70-no-write",
        "-e",
        `import { readFileSync } from "node:fs"; readFileSync(${JSON.stringify(hostJson)});`,
      ],
      { encoding: "utf8", timeout: 10_000 },
    );
    assert.notEqual(denied.status, 0, "host artifact path must be inaccessible to a permission-restricted process");

    const restrictedOut = join(fetcher, "restricted.json");
    const restricted = runCli(["fetch", "--ticket", ticketPath, "--out", restrictedOut], {
      cwd: fetcher,
      permission: {
        allowRead: [D14_DIR, `${D14_DIR}/`, fetcher, `${fetcher}/`, tickets, `${tickets}/`],
        allowWrite: [fetcher, `${fetcher}/`],
      },
    });
    assert.equal(restricted.status, 0, restricted.stderr + restricted.stdout);
    const restrictedBody = JSON.parse(restricted.stdout);
    assert.equal(restrictedBody.acquisition.code, "unsupported-portable-acquisition");
    assert.equal(restrictedBody.httpArtifactsDelivered, false);

    const localDir = join(fetcher, "local-artifacts");
    mkdirSync(localDir);
    copyFileSync(hostJson, join(localDir, "budget-impact.json"));
    copyFileSync(hostMd, join(localDir, "budget-impact.md"));
    const acquireTo = join(fetcher, "acquired");
    const localFetch = runCli(
      ["fetch", "--ticket", ticketPath, "--out", join(fetcher, "local.json"), "--local-artifacts", localDir, "--acquire-to", acquireTo],
      { cwd: fetcher },
    );
    assert.equal(localFetch.status, 0, localFetch.stderr + localFetch.stdout);
    const localBody = JSON.parse(localFetch.stdout);
    assert.equal(localBody.acquisition.code, "local-acquired");
    assert.equal(localBody.acquisition.source, "local");
    assert.equal(localBody.httpArtifactsDelivered, false);
    const artifact = readFileSync(join(acquireTo, "budget-impact.json"), "utf8");
    assert.match(artifact, /desk-embed|1\.5|0\.12|desk-chat/);
    assert.equal(artifact.includes("mutated"), false);

    const missing = await getResult(origin, "cw70-valid-but-wrong-id");
    assert.equal(missing.status, 404);
    assert.equal(missing.classify.kind, "http-transport-failure");
    assert.equal(missing.classify.code, "not-found");
  });

  it("genuine no-change is analysis-outcome, not engine-transport-failure", async () => {
    const origin = await runtime.originPromise;
    const work = tmpWork("cw70-same-");
    const same = `${JSON.stringify(JSON.parse(readFileSync(join(D14_DIR, "fixtures/caller/vendor-budget-impact/before.json"), "utf8")), null, 2)}\n`;
    const beforePath = join(work, "before.json");
    const afterPath = join(work, "after.json");
    writeFileSync(beforePath, same);
    writeFileSync(afterPath, same);
    const ticketPath = join(work, "ticket.json");
    const submit = runCli([
      "submit",
      "--base",
      origin,
      "--job",
      "vendor-budget-impact",
      "--before",
      beforePath,
      "--after",
      afterPath,
      "--execution-id",
      `cw70-same-${Date.now()}`,
      "--ticket",
      ticketPath,
    ]);
    assert.equal(submit.status, 0, submit.stderr + submit.stdout);
    const body = JSON.parse(submit.stdout);
    assert.equal(body.classify.kind, "analysis-outcome");
    assert.notEqual(body.ticket.classify.kind, "execution-transport-failure");
    const analysis = body.ticket.classify.body?.analysis || body.ticket.classify.analysis;
    assert.notEqual(analysis?.outcome, "crashed");
  });

  it("HTTP 200 contract refusal stays distinct from analysis-outcome", async () => {
    const origin = await runtime.originPromise;
    const unknown = await postExecute(origin, { jobId: "not-a-real-job", inputs: {}, executionId: `cw70-unknown-${Date.now()}` });
    assert.equal(unknown.status, 200);
    assert.equal(unknown.classify.kind, "contract-refusal");
    assert.equal(unknown.body.code, "unknown-job");
    assert.equal(unknown.body.transport, "rejected");
    assert.notEqual(unknown.classify.kind, "http-transport-failure");
    assert.notEqual(unknown.classify.kind, "execution-transport-failure");

    const sample = await postExecute(origin, {
      jobId: "vendor-budget-impact",
      executionId: `cw70-sample-${Date.now()}`,
      example: true,
      fundingIntent: "reserved-fixture",
      payment: JSON.parse(readFileSync(paymentPath, "utf8")),
    });
    assert.equal(sample.status, 200);
    assert.equal(sample.classify.kind, "contract-refusal");
    assert.equal(sample.body.code, "sample-not-a-sale");
    assert.equal(sample.body.sold, false);
    assert.equal(sample.body.transport, "rejected");
    assert.notEqual(sample.classify.kind, "analysis-outcome");
  });

  it("invalid JSON body is HTTP 400 transport failure", async () => {
    const origin = await runtime.originPromise;
    const response = await fetch(`${origin}/execute`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    });
    const body = await response.json();
    const classified = classifyHttpExchange({ status: response.status, body });
    assert.equal(response.status, 400);
    assert.equal(classified.kind, "http-transport-failure");
    assert.equal(classified.code, "invalid-json");
  });

  it("real 409 on job, input, and terms substitution; same-id replay returns the original", async () => {
    const origin = await runtime.originPromise;
    const pair = uniquePair();
    const id = `cw70-409-${pair.nonce}`.slice(0, 128);
    const first = await postExecute(origin, {
      jobId: "vendor-budget-impact",
      executionId: id,
      inputs: {
        before: readFileSync(pair.beforePath, "utf8"),
        after: readFileSync(pair.afterPath, "utf8"),
      },
    });
    assert.equal(first.status, 200, JSON.stringify(first.body));
    const replay = await postExecute(origin, {
      jobId: "vendor-budget-impact",
      executionId: id,
      inputs: {
        before: readFileSync(pair.beforePath, "utf8"),
        after: readFileSync(pair.afterPath, "utf8"),
      },
    });
    assert.equal(replay.status, 200);
    assert.equal(replay.body.executionId, first.body.executionId);
    assert.equal(replay.body.receipt?.outputsDigest, first.body.receipt?.outputsDigest);

    const jobSwap = await postExecute(origin, {
      jobId: "feed-agenda",
      executionId: id,
      inputs: {
        before: readFileSync(pair.beforePath, "utf8"),
        after: readFileSync(pair.afterPath, "utf8"),
      },
    });
    assert.equal(jobSwap.status, 409);
    assert.equal(jobSwap.classify.code, "execution-id-conflict");

    const other = uniquePair();
    const inputSwap = await postExecute(origin, {
      jobId: "vendor-budget-impact",
      executionId: id,
      inputs: {
        before: readFileSync(other.beforePath, "utf8"),
        after: readFileSync(other.afterPath, "utf8"),
      },
    });
    assert.equal(inputSwap.status, 409);

    const termsSwap = await postExecute(origin, {
      jobId: "vendor-budget-impact",
      executionId: id,
      fundingIntent: "reserved-fixture",
      payment: JSON.parse(readFileSync(paymentPath, "utf8")),
      inputs: {
        before: readFileSync(pair.beforePath, "utf8"),
        after: readFileSync(pair.afterPath, "utf8"),
      },
    });
    assert.equal(termsSwap.status, 409);
  });

  it("two concurrent clients: same-id replay and conflicting request", async () => {
    const origin = await runtime.originPromise;
    const pair = uniquePair();
    const other = uniquePair();
    const id = `cw70-conc-${pair.nonce}`.slice(0, 128);
    const work = tmpWork("cw70-conc-");
    const a = spawnCli(submitArgs(origin, pair, join(work, "a.json"), id), { cwd: work });
    const b = spawnCli(submitArgs(origin, pair, join(work, "b.json"), id), { cwd: work });
    const [ra, rb] = await Promise.all([a.done, b.done]);
    assert.equal(ra.status, 0, ra.stderr + ra.stdout);
    assert.equal(rb.status, 0, rb.stderr + rb.stdout);
    const ta = JSON.parse(ra.stdout);
    const tb = JSON.parse(rb.stdout);
    assert.equal(ta.ticket.executionId, id);
    assert.equal(tb.ticket.executionId, id);
    const conflict = runCli(submitArgs(origin, other, join(work, "c.json"), id), { cwd: work });
    const conflictBody = JSON.parse(conflict.stdout);
    assert.equal(conflictBody.classify.code, "execution-id-conflict");
    assert.equal(conflictBody.commitStatus, "rejected");
    assert.equal(conflictBody.ticket.executionId, id);
  });

  it("response lost after server commit; another process fetches without rerun", async () => {
    const origin = await runtime.originPromise;
    const pair = uniquePair();
    const id = `cw70-lost-${pair.nonce}`.slice(0, 128);
    const { server, origin: proxyOrigin } = await startDropPostProxy(origin);
    try {
      const sender = tmpWork("cw70-lost-send-");
      const ticketPath = join(sender, "ticket.json");
      const submit = await runCliAsync(submitArgs(proxyOrigin, pair, ticketPath, id), { cwd: sender });
      assert.notEqual(submit.status, 0);
      const ticket = JSON.parse(readFileSync(ticketPath, "utf8"));
      assert.equal(ticket.executionId, id);
      assert.equal(["uncertain", "not-sent"].includes(ticket.commitStatus), true, ticket.commitStatus);
      const fetcher = tmpWork("cw70-lost-fetch-");
      const fetchTicket = join(fetcher, "ticket.json");
      writeFileSync(fetchTicket, readFileSync(ticketPath));
      const fetchProc = await runCliAsync(["fetch", "--ticket", fetchTicket, "--out", join(fetcher, "out.json")], { cwd: fetcher });
      assert.equal(fetchProc.status, 0, fetchProc.stderr + fetchProc.stdout);
      const fetched = JSON.parse(fetchProc.stdout);
      assert.equal(fetched.classify.kind, "analysis-outcome");
      assert.equal(fetched.executionId, id);
      const stored = await getResult(origin, id);
      assert.equal(stored.status, 200, JSON.stringify(stored.body));
      assert.equal(stored.body.executionId, id);
      assert.equal(stored.body.receipt?.outputsDigest, JSON.parse(readFileSync(join(fetcher, "out.json"), "utf8")).result.receipt.outputsDigest);
    } finally {
      await closeServer(server);
    }
  });
});

describe("CW70 process-local cache restart", { timeout: 240_000 }, () => {
  it("restarted serve-execution process does not recover the previous id", async () => {
    const first = spawnExecutionHttp();
    try {
      const origin = await first.originPromise;
      const pair = uniquePair();
      const id = `cw70-restart-${pair.nonce}`.slice(0, 128);
      const posted = await postExecute(origin, {
        jobId: "vendor-budget-impact",
        executionId: id,
        inputs: {
          before: readFileSync(pair.beforePath, "utf8"),
          after: readFileSync(pair.afterPath, "utf8"),
        },
      });
      assert.equal(posted.status, 200, JSON.stringify(posted.body));
      first.stop();
      await new Promise((r) => first.child.once("exit", r));
      const second = spawnExecutionHttp();
      try {
        const origin2 = await second.originPromise;
        const missing = await getResult(origin2, id);
        assert.equal(missing.status, 404);
        assert.equal(missing.classify.code, "not-found");
      } finally {
        second.stop();
      }
    } finally {
      first.stop();
    }
  });
});

describe("CW70 labelled HTTP adapter faults (unchanged runtime execute injection)", { timeout: 20_000 }, () => {
  it("410 expired cache is a transport failure", async () => {
    const { server } = createExecutionServer({
      resultTtlMs: 40,
      execute: async (req) => ({
        ok: true,
        jobId: req.jobId,
        executionId: req.executionId,
        contract: EXECUTION_CONTRACT_VERSION,
        transport: "ok",
        delivery: { complete: true, status: "complete", missing: [] },
        outputs: [],
      }),
    });
    const addr = await listenExecutionServer(server, { host: "127.0.0.1", port: 0 });
    try {
      const posted = await postExecute(addr.origin, { jobId: "vendor-budget-impact", executionId: "cw70-ttl" });
      assert.equal(posted.status, 200);
      await new Promise((r) => setTimeout(r, 80));
      const got = await getResult(addr.origin, "cw70-ttl");
      assert.equal(got.status, 410);
      assert.equal(got.classify.kind, "http-transport-failure");
      assert.equal(got.classify.code, "execution-expired");
    } finally {
      await closeServer(server);
    }
  });

  it("labelled incomplete ok:true over HTTP is not analysis success", async () => {
    const { server } = createExecutionServer({
      execute: async (req) => ({
        ok: true,
        jobId: req.jobId,
        executionId: req.executionId,
        contract: EXECUTION_CONTRACT_VERSION,
        transport: "ok",
        outputs: [],
        delivery: { complete: false, status: "incomplete", missing: ["budget-impact.json"] },
      }),
    });
    const addr = await listenExecutionServer(server, { host: "127.0.0.1", port: 0 });
    try {
      const posted = await postExecute(addr.origin, { jobId: "vendor-budget-impact", executionId: "cw70-lab-inc" });
      assert.equal(posted.status, 200);
      assert.notEqual(posted.classify.kind, "analysis-outcome");
      assert.equal(posted.classify.kind, "incomplete-delivery");
    } finally {
      await closeServer(server);
    }
  });
});

