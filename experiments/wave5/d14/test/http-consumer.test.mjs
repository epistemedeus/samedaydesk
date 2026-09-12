import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { classifyHttpExchange, getHealth, postExecute, ticketFromSubmit } from "../lib/client.mjs";
import { ConsumerRefuse, encodeInputFile } from "../lib/encode-inputs.mjs";
import { createTicket, readTicket } from "../lib/ticket.mjs";
import { verifyTicketBoundResult } from "../lib/verify.mjs";
import { resolveRetrieval } from "../lib/origin.mjs";
import { EXECUTION_CONTRACT_VERSION, RUNTIME_PIN, ARCHIVE_PIN } from "../lib/pins.mjs";
import { createServer } from "node:http";
import { closeServer, listen, runCli, runCliAsync, tmpWork } from "./helpers.mjs";
import { resolveServeRoot } from "./spawn-d01.mjs";

describe("W5-D14 unit client (no engine, no git fetch)", { timeout: 30_000 }, () => {
  it("in-tree serve-execution.mjs exists; git-fetch fallback is gone", () => {
    const root = resolveServeRoot();
    assert.equal(
      existsSync(join(root, "server/paid-useful-jobs/bin/serve-execution.mjs")),
      true,
    );
    const spawnSrc = readFileSync(join(root, "experiments/wave5/d14/test/spawn-d01.mjs"), "utf8");
    assert.equal(/spawnSync\(\s*["']git["']/.test(spawnSrc), false);
    assert.equal(spawnSrc.includes("git fetch"), false);
    assert.equal(spawnSrc.includes("worktree add"), false);
    assert.match(RUNTIME_PIN, /^c6f1464/);
    assert.match(ARCHIVE_PIN, /^8a811bba/);
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
      const s = createServer();
      s.listen(0, "127.0.0.1", () => {
        const addr = s.address();
        const origin = `http://127.0.0.1:${addr.port}`;
        s.close(() => resolve(origin));
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

  it("invalid execution id is refused before network I/O", async () => {
    let calls = 0;
    const posted = await postExecute(
      "http://127.0.0.1:1",
      { jobId: "vendor-budget-impact", executionId: "../escape" },
      {
        fetchImpl: async () => {
          calls += 1;
          return new Response("{}", { status: 200 });
        },
      },
    );
    assert.equal(posted.classify.code, "invalid-execution-id");
    const r = runCli([
      "submit",
      "--base",
      "http://127.0.0.1:1",
      "--job",
      "vendor-budget-impact",
      "--execution-id",
      "../escape",
      "--ticket",
      join(tmpWork(), "t.json"),
    ]);
    assert.equal(r.status, 2, r.stdout);
    assert.equal(JSON.parse(r.stdout).code, "invalid-execution-id");
    assert.equal(calls, 0);
  });

  it("fetch --base at a different origin is refused", () => {
    const work = tmpWork();
    const ticketPath = join(work, "ticket.json");
    writeFileSync(
      ticketPath,
      `${JSON.stringify({
        contract: EXECUTION_CONTRACT_VERSION,
        origin: "http://127.0.0.1:12345",
        jobId: "vendor-budget-impact",
        executionId: "cw70-foreign-base",
        retrieval: { id: "cw70-foreign-base", path: "/results/cw70-foreign-base" },
        submitted: {},
      })}\n`,
    );
    const r = runCli(["fetch", "--ticket", ticketPath, "--base", "http://127.0.0.1:9", "--out", join(work, "out.json")]);
    assert.equal(r.status, 2, r.stdout);
    assert.equal(JSON.parse(r.stdout).code, "foreign-origin");
  });

  it("userinfo, query, fragment, and encoded traversal are rejected", () => {
    assert.throws(() => resolveRetrieval("http://user:pass@127.0.0.1:9", "abc"), (e) => e.code === "invalid-origin");
    assert.throws(() => resolveRetrieval("http://127.0.0.1:9", "/results/abc?x=1"), (e) => e.code === "ambiguous-retrieval");
    assert.throws(() => resolveRetrieval("http://127.0.0.1:9", "/results/abc#f"), (e) => e.code === "ambiguous-retrieval");
    assert.throws(() => resolveRetrieval("http://127.0.0.1:9", "/results/%2e%2e%2fetc"), (e) => e.code === "encoded-traversal");
    assert.throws(() => resolveRetrieval("http://127.0.0.1:9", "https://evil.example/results/x"), (e) => e.code === "foreign-origin");
  });

  it("ticketFromSubmit keeps caller id when POST is lost", () => {
    const ticket = ticketFromSubmit({
      origin: "http://127.0.0.1:12345",
      request: { jobId: "vendor-budget-impact", executionId: "cw70-unit-lost" },
      submitted: {},
      posted: { status: 0, body: null, classify: { kind: "http-transport-failure", code: "timeout" } },
    });
    assert.equal(ticket.executionId, "cw70-unit-lost");
    assert.equal(ticket.retrieval.path, "/results/cw70-unit-lost");
    assert.equal(ticket.commitStatus, "uncertain");
    assert.equal(ticket.durableExactlyOnce, false);
  });

  it("internally consistent substituted inputs are not caller proof", () => {
    const ticket = createTicket({
      origin: "http://127.0.0.1:9",
      request: { jobId: "vendor-budget-impact", executionId: "cw70-sub" },
      submitted: {
        before: { bytes: 3, sha256: "aaa", stagedSha256: "bbb" },
      },
    });
    const body = {
      ok: true,
      contract: EXECUTION_CONTRACT_VERSION,
      executionId: "cw70-sub",
      jobId: "vendor-budget-impact",
      transport: "ok",
      delivery: { complete: true, status: "complete", missing: [] },
      outputs: [{ name: "budget-impact.json", bytes: 1, sha256: "ccc" }, { name: "budget-impact.md", bytes: 1, sha256: "ddd" }],
      receipt: {
        jobId: "vendor-budget-impact",
        inputs: [{ name: "before", kind: "file", bytes: 99, sha256: "ffff" }],
        inputsDigest: "eeee",
        outputsDigest: "ffff",
      },
    };
    const verified = verifyTicketBoundResult(ticket, body);
    assert.equal(verified.ok, false);
    assert.equal(
      verified.failures.some((f) => f.code === "input-digest-mismatch" || f.code === "inputs-digest-mismatch"),
      true,
      JSON.stringify(verified.failures),
    );
    assert.match(verified.termsProof.note, /does not echo/);
  });

  it("job substitution fails ticket verification even if executionId matches", () => {
    const ticket = createTicket({
      origin: "http://127.0.0.1:9",
      request: { jobId: "vendor-budget-impact", executionId: "cw70-job" },
      submitted: {},
    });
    const verified = verifyTicketBoundResult(ticket, {
      ok: true,
      contract: EXECUTION_CONTRACT_VERSION,
      executionId: "cw70-job",
      jobId: "feed-agenda",
      transport: "ok",
      delivery: { complete: true },
    });
    assert.equal(verified.ok, false);
    assert.equal(verified.failures.some((f) => f.code === "job-mismatch"), true);
  });
});

describe("W5-D14 ticket persisted before POST", { timeout: 20_000 }, () => {
  it("atomic ticket with caller executionId exists before the server reads the body", async () => {
    const work = tmpWork();
    const ticketPath = join(work, "ticket.json");
    const seen = [];
    const { server, origin } = await listen((req, res) => {
      const chunks = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => {
        const onDisk = JSON.parse(readFileSync(ticketPath, "utf8"));
        seen.push({
          method: req.method,
          url: req.url,
          executionId: onDisk.executionId,
          commitStatus: onDisk.commitStatus,
          body: Buffer.concat(chunks).toString("utf8"),
        });
        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            ok: true,
            contract: EXECUTION_CONTRACT_VERSION,
            executionId: "server-should-not-win",
            jobId: "vendor-budget-impact",
            transport: "ok",
            delivery: { complete: true, status: "complete", missing: [] },
            outputs: [
              { name: "budget-impact.json", bytes: 2, sha256: "ab" },
              { name: "budget-impact.md", bytes: 2, sha256: "cd" },
            ],
            receipt: { jobId: "vendor-budget-impact", inputs: [], outputs: [] },
          }),
        );
      });
    });
    try {
      const before = join(work, "before.json");
      const after = join(work, "after.json");
      writeFileSync(before, `${JSON.stringify({ rows: [{ field: "a", value: 1, unit: "USD" }] })}\n`);
      writeFileSync(after, `${JSON.stringify({ rows: [{ field: "a", value: 2, unit: "USD" }] })}\n`);
      const r = await runCliAsync([
        "submit",
        "--base",
        origin,
        "--job",
        "vendor-budget-impact",
        "--execution-id",
        "cw70-before-post",
        "--before",
        before,
        "--after",
        after,
        "--ticket",
        ticketPath,
      ]);
      assert.equal(r.status === 0 || r.status === 2, true, r.stderr + r.stdout);
      assert.equal(seen.length, 1);
      assert.equal(seen[0].executionId, "cw70-before-post");
      assert.equal(seen[0].commitStatus, "unsent");
      const ticket = readTicket(ticketPath);
      assert.equal(ticket.executionId, "cw70-before-post");
      assert.equal(ticket.retrieval.path, "/results/cw70-before-post");
      assert.notEqual(ticket.executionId, "server-should-not-win");
    } finally {
      await closeServer(server);
    }
  });

  it("does not generate a new id when resubmitting an existing ticket", async () => {
    const work = tmpWork();
    const ticketPath = join(work, "ticket.json");
    const ids = [];
    const { server, origin } = await listen((req, res) => {
      const chunks = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => {
        const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
        ids.push(body.executionId);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: false, code: "unknown-job", executionId: body.executionId, contract: EXECUTION_CONTRACT_VERSION, transport: "rejected" }));
      });
    });
    try {
      const first = await runCliAsync([
        "submit",
        "--base",
        origin,
        "--job",
        "not-a-real-job",
        "--execution-id",
        "cw70-reuse-id",
        "--ticket",
        ticketPath,
      ]);
      assert.equal(JSON.parse(first.stdout).ticket.executionId, "cw70-reuse-id");
      const second = await runCliAsync(["submit", "--base", origin, "--job", "not-a-real-job", "--ticket", ticketPath]);
      assert.equal(JSON.parse(second.stdout).ticket.executionId, "cw70-reuse-id");
      assert.deepEqual(ids, ["cw70-reuse-id", "cw70-reuse-id"]);
    } finally {
      await closeServer(server);
    }
  });
});

describe("W5-D14 labelled incomplete HTTP 200", { timeout: 15_000 }, () => {
  it("ok:true with incomplete delivery is not analysis-outcome over real HTTP", async () => {
    const { server, origin } = await listen((_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          ok: true,
          transport: "ok",
          outputs: [],
          delivery: { complete: false, status: "incomplete", missing: ["budget-impact.json"] },
        }),
      );
    });
    try {
      const posted = await postExecute(origin, { jobId: "vendor-budget-impact", executionId: "cw70-incomplete" });
      assert.notEqual(posted.classify.kind, "analysis-outcome");
      assert.equal(posted.classify.kind, "incomplete-delivery");
      const classified = classifyHttpExchange({ status: 200, body: posted.body });
      assert.notEqual(classified.kind, "analysis-outcome");
    } finally {
      await closeServer(server);
    }
  });
});

