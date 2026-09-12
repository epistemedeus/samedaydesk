import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getResult, postExecute } from "../lib/client.mjs";
import { closeServer, listen } from "./helpers.mjs";

function collectSink() {
  const hits = [];
  return {
    hits,
    async listen() {
      const { server, origin } = await listen((req, res) => {
        const chunks = [];
        req.on("data", (c) => chunks.push(c));
        req.on("end", () => {
          hits.push({
            method: req.method,
            url: req.url,
            authorization: req.headers.authorization || null,
            bodyBytes: Buffer.concat(chunks).length,
          });
          res.writeHead(200, { "content-type": "application/json" });
          res.end('{"ok":true,"sink":true}');
        });
      });
      return { server, origin };
    },
  };
}

describe("W5-D14 labelled transport faults", { timeout: 20_000 }, () => {
  it("same-origin and cross-origin redirects send zero auth/body bytes to the sink", async () => {
    const sink = collectSink();
    const { server: sinkServer, origin: sinkOrigin } = await sink.listen();
    const sameHits = [];
    const { server: sameServer, origin: sameOrigin } = await listen((req, res) => {
      if (req.url === "/sink") {
        const chunks = [];
        req.on("data", (c) => chunks.push(c));
        req.on("end", () => {
          sameHits.push({
            method: req.method,
            authorization: req.headers.authorization || null,
            bodyBytes: Buffer.concat(chunks).length,
          });
          res.writeHead(200, { "content-type": "application/json" });
          res.end('{"ok":true,"sink":true}');
        });
        return;
      }
      res.writeHead(302, { location: `${sameOrigin}/sink` });
      res.end();
    });
    const { server: crossServer, origin: crossOrigin } = await listen((req, res) => {
      res.writeHead(302, { location: `${sinkOrigin}/captured` });
      res.end();
    });
    try {
      const samePost = await postExecute(sameOrigin, { jobId: "vendor-budget-impact", executionId: "cw70-redir-same" });
      const crossPost = await postExecute(crossOrigin, { jobId: "vendor-budget-impact", executionId: "cw70-redir-cross" });
      const sameGet = await getResult(sameOrigin, "cw70-redir-same");
      const crossGet = await getResult(crossOrigin, "cw70-redir-cross");
      for (const result of [samePost, crossPost, sameGet, crossGet]) {
        assert.equal(result.classify.kind, "http-transport-failure");
        assert.equal(result.classify.code, "redirect-disallowed");
      }
      assert.equal(sink.hits.length, 0);
      assert.equal(sameHits.length, 0);
      assert.equal(
        sink.hits.reduce((n, h) => n + h.bodyBytes, 0) + sameHits.reduce((n, h) => n + h.bodyBytes, 0),
        0,
      );
      assert.equal(sink.hits.every((h) => h.authorization == null), true);
    } finally {
      await closeServer(sameServer);
      await closeServer(crossServer);
      await closeServer(sinkServer);
    }
  });

  it("header timeout is a transport failure", async () => {
    const { server, origin } = await listen((req) => {
      req.resume();
    });
    try {
      const posted = await postExecute(
        origin,
        { jobId: "vendor-budget-impact", executionId: "cw70-hdr-to" },
        { timeoutMs: 250, bodyTimeoutMs: 250 },
      );
      assert.equal(posted.classify.kind, "http-transport-failure");
      assert.equal(["timeout", "fetch-failed"].includes(posted.classify.code) || posted.classify.code === "timeout", true);
    } finally {
      await closeServer(server);
    }
  });

  it("body timeout is a transport failure", async () => {
    const { server, origin } = await listen((req, res) => {
      req.resume();
      res.writeHead(200, { "content-type": "application/json" });
      res.write("{");
    });
    try {
      const posted = await postExecute(
        origin,
        { jobId: "vendor-budget-impact", executionId: "cw70-body-to" },
        { timeoutMs: 5_000, bodyTimeoutMs: 250 },
      );
      assert.equal(posted.classify.kind, "http-transport-failure");
      assert.equal(posted.classify.code, "body-timeout");
    } finally {
      await closeServer(server);
    }
  });

  it("non-JSON and oversized responses are transport failures, not analysis", async () => {
    const { server: nonJsonServer, origin: nonJsonOrigin } = await listen((req, res) => {
      req.resume();
      res.writeHead(200, { "content-type": "application/json" });
      res.end("not-json");
    });
    const { server: hugeServer, origin: hugeOrigin } = await listen((req, res) => {
      req.resume();
      res.writeHead(200, { "content-type": "application/json" });
      res.end(`{"ok":true,"pad":"${"x".repeat(2048)}"}`);
    });
    try {
      const nonJson = await postExecute(nonJsonOrigin, { jobId: "vendor-budget-impact", executionId: "cw70-nonjson" });
      assert.equal(nonJson.classify.kind, "http-transport-failure");
      assert.equal(nonJson.classify.code, "non-json-body");
      const huge = await postExecute(
        hugeOrigin,
        { jobId: "vendor-budget-impact", executionId: "cw70-huge" },
        { maxBodyBytes: 64 },
      );
      assert.equal(huge.classify.kind, "http-transport-failure");
      assert.equal(huge.classify.code, "response-too-large");
    } finally {
      await closeServer(nonJsonServer);
      await closeServer(hugeServer);
    }
  });

  it("labelled mutating GET proxy is rejected by ticket verification, not accepted via recomputed hashes", async () => {
    const { verifyTicketBoundResult } = await import("../lib/verify.mjs");
    const { createTicket } = await import("../lib/ticket.mjs");
    const { EXECUTION_CONTRACT_VERSION } = await import("../lib/pins.mjs");
    const { digestNamedBytes, sha256Bytes } = await import("../lib/digest-named.mjs");
    const before = { name: "before", kind: "file", bytes: 3, sha256: "aa".repeat(32) };
    const ticket = createTicket({
      origin: "http://127.0.0.1:9",
      request: { jobId: "vendor-budget-impact", executionId: "cw70-mut" },
      submitted: { before: { bytes: 3, sha256: "00".repeat(32), stagedSha256: before.sha256 } },
    });
    const attackerInputs = [{ name: "before", kind: "file", bytes: 8, sha256: "bb".repeat(32) }];
    const attackerDigest = digestNamedBytes(attackerInputs);
    const { server, origin } = await listen((req, res) => {
      req.resume();
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          ok: true,
          contract: EXECUTION_CONTRACT_VERSION,
          executionId: "cw70-mut",
          jobId: "vendor-budget-impact",
          transport: "ok",
          delivery: { complete: true, status: "complete", missing: [] },
          outputs: [{ name: "budget-impact.json", bytes: 1, sha256: sha256Bytes(Buffer.from("x")) }],
          receipt: {
            jobId: "vendor-budget-impact",
            inputs: attackerInputs,
            inputsDigest: attackerDigest,
            outputs: [{ name: "budget-impact.json", bytes: 1, sha256: sha256Bytes(Buffer.from("x")) }],
            outputsDigest: digestNamedBytes([{ name: "budget-impact.json", bytes: 1, sha256: sha256Bytes(Buffer.from("x")) }]),
          },
        }),
      );
    });
    try {
      const got = await getResult(origin, "cw70-mut");
      const verified = verifyTicketBoundResult(ticket, got.body);
      assert.equal(verified.ok, false);
      assert.equal(
        verified.failures.some((f) => f.code.includes("input") || f.code.includes("digest") || f.code.includes("substituted")),
        true,
        JSON.stringify(verified.failures),
      );
    } finally {
      await closeServer(server);
    }
  });
});

