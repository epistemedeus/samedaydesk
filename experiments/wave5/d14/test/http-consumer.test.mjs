import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, describe, it } from "node:test";
import { declaredRouteMetadata } from "../../../../server/paid-useful-jobs/lib/envelope.mjs";
import { classifyHttpExchange, getHealth, getResult, postExecute } from "../lib/client.mjs";
import { ConsumerRefuse, encodeExecuteRequest, encodeInputFile } from "../lib/encode-inputs.mjs";
import { D01_PIN, D14_DIR, EXECUTION_CONTRACT_VERSION, REPO_ROOT } from "../lib/pins.mjs";
import { spawnD01Http } from "./spawn-d01.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const cli = join(here, "../bin/http-consumer.mjs");
const fixtureBefore = join(D14_DIR, "fixtures/caller/vendor-budget-impact/before.json");
const fixtureAfter = join(D14_DIR, "fixtures/caller/vendor-budget-impact/after.json");
const paymentPath = join(
  REPO_ROOT,
  "server/paid-useful-jobs/fixtures/payment/reserved-fixture.json",
);

function tmpWork() {
  return mkdtempSync(join(tmpdir(), "w5-d14-"));
}

function uniquePair() {
  const work = tmpWork();
  const nonce = `w5-d14-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const before = JSON.parse(readFileSync(fixtureBefore, "utf8"));
  const after = JSON.parse(readFileSync(fixtureAfter, "utf8"));
  before.note = `${before.note} nonce=${nonce}`;
  after.note = `${after.note} nonce=${nonce}`;
  const beforePath = join(work, "before.json");
  const afterPath = join(work, "after.json");
  writeFileSync(beforePath, `${JSON.stringify(before, null, 2)}\n`);
  writeFileSync(afterPath, `${JSON.stringify(after, null, 2)}\n`);
  return { work, nonce, beforePath, afterPath };
}

function runCli(argv, { timeout = 120_000 } = {}) {
  return spawnSync(process.execPath, [cli, ...argv], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    timeout,
    maxBuffer: 8 * 1024 * 1024,
  });
}

function listenApp(app) {
  return new Promise((resolve) => {
    const server = createServer(app);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      resolve({ server, origin: `http://127.0.0.1:${addr.port}` });
    });
  });
}

describe("W5-D14 current SDS52 HTTP", { timeout: 30_000 }, () => {
  it("SDS52 declared paid-useful-jobs URLs are not live routes", () => {
    const declared = declaredRouteMetadata("vendor-budget-impact");
    assert.equal(declared.live, false);
    assert.equal(declared.publishedToLiveCatalog, false);
    assert.match(declared.resource.url, /\/paid-useful-jobs\/vendor-budget-impact$/);
  });

  it("SDS52 Express POST /execute is not the D01 execution contract", async () => {
    const { createSdsApp } = await import("../../../../server/app.js");
    const app = createSdsApp();
    const { server, origin } = await listenApp(app);
    try {
      const response = await fetch(`${origin}/execute`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jobId: "vendor-budget-impact" }),
      });
      assert.notEqual(response.status, 200);
      let body = null;
      try {
        body = await response.json();
      } catch {
        body = null;
      }
      assert.notEqual(body?.contract, EXECUTION_CONTRACT_VERSION);
      assert.equal(body?.retrieval?.path == null, true);
    } finally {
      server.close();
    }
  });

  it("consumer refuses non-JSON bytes instead of sending a shared-disk path", () => {
    const xml = join(tmpWork(), "before.xml");
    writeFileSync(xml, "<feed><title>not json</title></feed>\n");
    assert.throws(
      () => encodeInputFile("before", xml),
      (err) => err instanceof ConsumerRefuse && err.code === "non-json-inline",
    );
    const r = runCli(["submit", "--base", "http://127.0.0.1:1", "--job", "feed-agenda", "--before", xml, "--ticket", join(tmpWork(), "t.json")]);
    assert.equal(r.status, 2, r.stderr + r.stdout);
    const body = JSON.parse(r.stdout);
    assert.equal(body.code, "non-json-inline");
  });

  it("closed port is http-transport-failure, not an analysis refusal", async () => {
    const closed = await new Promise((resolve) => {
      const server = createServer();
      server.listen(0, "127.0.0.1", () => {
        const addr = server.address();
        const origin = `http://127.0.0.1:${addr.port}`;
        server.close(() => resolve(origin));
      });
    });
    const got = await getHealth(closed);
    assert.equal(got.classify.kind, "http-transport-failure");
    assert.equal(got.classify.code, "connection-refused");
    const r = runCli(["health", "--base", closed]);
    assert.notEqual(r.status, 0);
    const body = JSON.parse(r.stdout);
    assert.equal(body.classify.kind, "http-transport-failure");
    assert.equal(body.classify.code, "connection-refused");
  });
});

describe("W5-D14 consumer against D01 HTTP", { timeout: 180_000 }, () => {
  const d01 = spawnD01Http();
  after(() => d01.stop());

  it("D01 loopback /health names execution.v1", async () => {
    const origin = await d01.originPromise;
    const health = await getHealth(origin);
    assert.equal(health.status, 200);
    assert.equal(health.body.ok, true);
    assert.equal(health.body.contract, EXECUTION_CONTRACT_VERSION);
    assert.equal(d01.pin, D01_PIN);
    assert.equal(existsServe(d01.root), true);
  });

  it("independent submit process supplies JSON bytes and a second process fetches that result", async () => {
    const origin = await d01.originPromise;
    const pair = uniquePair();
    const encoded = encodeExecuteRequest({
      jobId: "vendor-budget-impact",
      files: { before: pair.beforePath, after: pair.afterPath },
    });
    assert.equal(JSON.stringify(encoded.request).includes(pair.beforePath), false);
    assert.equal(JSON.stringify(encoded.request).includes(pair.afterPath), false);
    assert.match(encoded.request.inputs.before, new RegExp(pair.nonce));

    const ticketPath = join(pair.work, "ticket.json");
    const submit = runCli([
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
    ]);
    assert.equal(submit.status, 0, submit.stderr + submit.stdout);
    const submitBody = JSON.parse(submit.stdout);
    assert.equal(submitBody.classify.kind, "analysis-outcome");
    assert.equal(submitBody.ticket.retrieval.path.startsWith("/results/"), true);
    assert.equal(submitBody.ok, true);

    const outPath = join(pair.work, "fetched.json");
    const fetchProc = runCli(["fetch", "--ticket", ticketPath, "--out", outPath]);
    assert.equal(fetchProc.status, 0, fetchProc.stderr + fetchProc.stdout);
    const fetched = JSON.parse(readFileSync(outPath, "utf8"));
    assert.equal(fetched.classify.kind, "analysis-outcome");
    assert.equal(fetched.result.ok, true);
    assert.equal(fetched.result.sold, false);
    assert.equal(fetched.result.sample, false);
    assert.equal(fetched.result.contract, EXECUTION_CONTRACT_VERSION);
    assert.equal(fetched.result.executionId, submitBody.ticket.executionId);
    assert.equal(fetched.result.transport, "ok");
    assert.notEqual(fetched.result.analysis?.outcome, "crashed");

    const beforeRow = fetched.result.receipt.inputs.find((row) => row.name === "before");
    assert.equal(beforeRow.sha256, encoded.submitted.before.stagedSha256);
    const afterRow = fetched.result.receipt.inputs.find((row) => row.name === "after");
    assert.equal(afterRow.sha256, encoded.submitted.after.stagedSha256);
    assert.match(fetched.result.receipt.outputsDigest, /^[0-9a-f]{64}$/);
    assert.equal(fetched.result.outputs.some((o) => o.name === "budget-impact.json"), true);
    assert.equal(fetched.result.outputs.some((o) => o.name === "budget-impact.md"), true);
  });

  it("fetch of another executionId is not this job's result", async () => {
    const origin = await d01.originPromise;
    const a = uniquePair();
    const b = uniquePair();
    const ticketA = join(a.work, "ticket.json");
    const ticketB = join(b.work, "ticket.json");
    const subA = runCli([
      "submit",
      "--base",
      origin,
      "--job",
      "vendor-budget-impact",
      "--before",
      a.beforePath,
      "--after",
      a.afterPath,
      "--ticket",
      ticketA,
    ]);
    const subB = runCli([
      "submit",
      "--base",
      origin,
      "--job",
      "vendor-budget-impact",
      "--before",
      b.beforePath,
      "--after",
      b.afterPath,
      "--ticket",
      ticketB,
    ]);
    assert.equal(subA.status, 0, subA.stderr + subA.stdout);
    assert.equal(subB.status, 0, subB.stderr + subB.stdout);
    const ta = JSON.parse(readFileSync(ticketA, "utf8"));
    const tb = JSON.parse(readFileSync(ticketB, "utf8"));
    assert.notEqual(ta.executionId, tb.executionId);

    const gotA = await getResult(origin, ta.retrieval.path);
    const gotB = await getResult(origin, tb.retrieval.path);
    assert.equal(gotA.body.executionId, ta.executionId);
    assert.equal(gotB.body.executionId, tb.executionId);
    assert.notEqual(gotA.body.receipt.inputsDigest, gotB.body.receipt.inputsDigest);

    const missing = await getResult(origin, "/results/not-a-real-execution");
    assert.equal(missing.status, 404);
    assert.equal(missing.classify.kind, "http-transport-failure");
    assert.equal(missing.classify.code, "not-found");
  });

  it("SAMPLE inline JSON is a contract refusal over HTTP 200, not a transport crash", async () => {
    const origin = await d01.originPromise;
    const posted = await postExecute(origin, {
      jobId: "evidence-ci-annotation",
      inputs: {
        input: `${JSON.stringify({ label: "SAMPLE", sampleLabel: "SAMPLE", findings: [] })}\n`,
      },
      fundingIntent: "reserved-fixture",
      payment: JSON.parse(readFileSync(paymentPath, "utf8")),
    });
    assert.equal(posted.status, 200);
    assert.equal(posted.classify.kind, "contract-refusal");
    assert.equal(posted.body.code, "sample-not-a-sale");
    assert.equal(posted.body.sold, false);
    assert.equal(posted.body.sample, true);
    assert.equal(posted.body.transport, "rejected");
    assert.notEqual(posted.classify.kind, "http-transport-failure");
    assert.notEqual(posted.classify.kind, "execution-transport-failure");

    const stored = await getResult(origin, posted.body.retrieval.path);
    assert.equal(stored.status, 200);
    assert.equal(stored.body.code, "sample-not-a-sale");
    assert.equal(stored.body.executionId, posted.body.executionId);
  });

  it("identical before/after is analysis-outcome, not engine-transport-failure", async () => {
    const origin = await d01.originPromise;
    const work = tmpWork();
    const same = `${JSON.stringify(JSON.parse(readFileSync(fixtureBefore, "utf8")), null, 2)}\n`;
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
      "--ticket",
      ticketPath,
    ]);
    assert.equal(submit.status, 0, submit.stderr + submit.stdout);
    const body = JSON.parse(submit.stdout);
    assert.equal(body.classify.kind, "analysis-outcome");
    assert.notEqual(body.ticket.classify.kind, "execution-transport-failure");
    assert.equal(body.ok, true);
    assert.equal(body.ticket.classify.body.transport, "ok");
  });

  it("invalid JSON body is HTTP 400 transport failure, not a domain report", async () => {
    const origin = await d01.originPromise;
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
    assert.notEqual(body.analysis?.outcome, "completed");
  });

  it("unknown job is contract-refusal with retrieval, sold remains false", async () => {
    const origin = await d01.originPromise;
    const posted = await postExecute(origin, { jobId: "not-a-real-job", inputs: {} });
    assert.equal(posted.status, 200);
    assert.equal(posted.classify.kind, "contract-refusal");
    assert.equal(posted.body.code, "unknown-job");
    assert.equal(posted.body.sold, false);
    assert.equal(posted.body.transport, "rejected");
    const stored = await getResult(origin, posted.body.retrieval.path);
    assert.equal(stored.body.code, "unknown-job");
    assert.equal(stored.body.executionId, posted.body.executionId);
  });
});

function existsServe(root) {
  return readFileSync(join(root, "server/paid-useful-jobs/bin/serve-execution.mjs"), "utf8").includes(
    "createExecutionServer",
  );
}
