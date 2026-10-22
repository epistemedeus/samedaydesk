// Deliberately red regression specifications against the imported D14 source.
// No server, engine, network, payment, monorepo fallback, or child process runs.
import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyHttpExchange, getResult, postExecute, ticketFromSubmit } from "../../../wave5/d14/lib/client.mjs";

test("refused connection stays a transport failure (existing control)", () => {
  const fetchError = Object.assign(new Error("fetch failed"), {
    cause: new AggregateError([Object.assign(new Error("refused"), { code: "ECONNREFUSED" })]),
  });
  assert.equal(classifyHttpExchange({ fetchError }).code, "connection-refused");
});

test("HTTP 200 ok cannot count incomplete output as successful analysis", () => {
  const result = classifyHttpExchange({ status: 200, body: {
    ok: true, transport: "ok", outputs: [],
    delivery: { complete: false, status: "incomplete", missing: ["budget-impact.json"] },
  } });
  assert.notEqual(result.kind, "analysis-outcome");
});

test("response loss retains the caller-owned execution ID for recovery", () => {
  const ticket = ticketFromSubmit({
    origin: "http://127.0.0.1:12345",
    request: { jobId: "vendor-budget-impact", executionId: "cw70-frozen-request" },
    submitted: {},
    posted: { status: 0, body: null, classify: { kind: "http-transport-failure" } },
  });
  assert.equal(ticket.executionId, "cw70-frozen-request");
  assert.equal(ticket.retrieval?.path, "/results/cw70-frozen-request");
});

test("POST explicitly blocks automatic redirects before sending caller bytes", async () => {
  let options;
  await postExecute("http://127.0.0.1:12345", { jobId: "vendor-budget-impact" }, {
    fetchImpl: async (_url, opts) => {
      options = opts;
      return new Response('{"ok":true}', { status: 200 });
    },
  });
  assert.ok(["manual", "error"].includes(options.redirect), "fetch redirect policy must be explicit");
});

test("retrieval cannot address a different origin", async () => {
  let calls = 0;
  try {
    await getResult("http://127.0.0.1:12345", "//other.invalid/results/wrong", {
      fetchImpl: async () => {
        calls += 1;
        return new Response('{"ok":true}', { status: 200 });
      },
    });
  } catch { /* A local validation refusal is also acceptable. */ }
  assert.equal(calls, 0, "reject origin escape before any HTTP request");
});
