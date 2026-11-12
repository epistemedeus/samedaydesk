import test from "node:test";
import assert from "node:assert/strict";
import { chmodSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Readable } from "node:stream";
import { json, run, tempDir, REPORT } from "./helpers.mjs";
import { EXIT } from "../src/errors.mjs";

const HEALTH = { schema: "neomorphic.machine-gateway.health.v1", ready: true, runtime: "mounted-node", persistence: "postgres", paymentsEnabled: false, routeCount: 1 };
const DISCOVER = { schema: "neomorphic.machine-gateway.discovery.v1", version: "0.1.1", basePath: "/api/machine-gateway", paymentsEnabled: false,
  routes: [{ id: "lockfile.delta", version: "1", price: { amount: 0, unit: "usd-micros" }, timeoutMs: 5000, maxOutputBytes: 262144, executable: true,
    inputSchemaPath: "/api/machine-gateway/v1/routes/lockfile.delta/input.schema.json", outputSchemaPath: "/api/machine-gateway/v1/routes/lockfile.delta/output.schema.json" }] };
const PROFILE = { ok: true, value: { capability: { money: "unfunded", discovery: "qualified-source" }, signerAuthority: false, participation: { protocol: "voluntary-artifact-v1" } } };

test("capabilities reads gateway health, routes and market profile", async () => {
  const { exit, out, calls } = await run(["capabilities"], { answers: [json(200, HEALTH), json(200, DISCOVER), json(200, PROFILE)] });
  assert.equal(exit, 0);
  assert.deepEqual(calls.map(call => call.url), [
    "https://samedaydesk.com/api/machine-gateway/healthz",
    "https://samedaydesk.com/api/machine-gateway/v1/discover",
    "https://samedaydesk.com/api/neomorphic-contributor-journey/v1/market/profile",
  ]);
  assert.ok(calls.every(call => call.method === "GET" && call.redirect === "manual" && !call.headers.authorization));
  const result = out[0].result;
  assert.equal(result.gateway.routes[0].id, "lockfile.delta");
  assert.equal(result.gateway.paymentsEnabled, false);
  assert.equal(result.market.money, "unfunded");
  assert.deepEqual(result.credentialFreeTasks, ["readiness.check"]);
});

test("capabilities reports a failed source without hiding the others", async () => {
  const { exit, out } = await run(["capabilities"], { answers: [json(200, HEALTH), json(200, DISCOVER), json(404, { ok: false })] });
  assert.equal(exit, 0);
  assert.equal(out[0].result.status.marketProfile, "not_found");
  assert.equal(out[0].result.market, null);
});

test("capabilities with every source down is unavailable after bounded retries", async () => {
  const { exit, out, calls } = await run(["capabilities"], { answers: Array(9).fill(null).map(() => json(503, { error: { code: "store_unavailable" } })) });
  assert.equal(exit, EXIT.unavailable);
  assert.equal(out[0].error.code, "unavailable");
  assert.equal(calls.length, 9);
});

test("readiness check: positive journey saves a 0600 record and recovers it offline", async () => {
  const dir = tempDir();
  const file = join(dir, "result.json");
  const first = await run(["readiness", "check", "--host", "example.com", "--out", file, "--discovery", "mcp"], { answers: [json(200, REPORT)] });
  assert.equal(first.exit, 0);
  assert.equal(first.calls[0].url, "https://samedaydesk.com/agent-readiness?host=example.com&format=json");
  const result = first.out[0].result;
  assert.equal(result.schema, "samedaydesk.cli.readiness-record.v1");
  assert.equal(result.operationId, "check_agent_readiness");
  assert.match(result.correlationId, /^ae:corr:v1:[A-Za-z0-9_-]{22}$/);
  assert.match(result.stepEventId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.deepEqual(result.measurement, { v: 1, kind: "measurement", tool: "check_agent_readiness", correlationId: result.correlationId, step: 0, discovery: { status: "declared", source: "mcp" }, outcome: "report_received" });
  assert.equal(Object.hasOwn(result, "discovery"), false);
  assert.equal(result.report.score, 71);
  assert.equal(result.saved, file);
  assert.equal(statSync(file).mode & 0o777, 0o600);
  // The process and its stdout are gone; the network is down too.
  const later = await run(["result", "show", "--file", file], { answers: [] });
  assert.equal(later.exit, 0);
  assert.equal(later.calls.length, 0);
  assert.equal(later.out[0].result.verified, true);
  assert.equal(later.out[0].result.correlationId, result.correlationId);
  assert.deepEqual(later.out[0].result.report, REPORT);
});

test("readiness check without a declared label records unknown discovery", async () => {
  const { out } = await run(["readiness", "check", "--host", "example.com"], { answers: [json(200, REPORT)] });
  assert.deepEqual(out[0].result.measurement.discovery, { status: "unknown", source: null });
  assert.equal(out[0].result.saved, null);
});

test("recovery: a lost GET response is retried with bounded backoff", async () => {
  const { exit, out, calls, sleeps } = await run(["readiness", "check", "--host", "example.com"], { answers: [new TypeError("fetch failed"), json(502, "bad gateway", { "content-type": "text/html" }), json(200, REPORT)] });
  assert.equal(exit, 0);
  assert.equal(calls.length, 3);
  assert.deepEqual(sleeps, [200, 400]);
  assert.equal(out[0].result.attempts, 3);
});

test("failure: transport errors stop after three attempts with exit 2", async () => {
  const { exit, out, err, calls } = await run(["readiness", "check", "--host", "example.com"], { answers: [new TypeError("fetch failed"), new TypeError("fetch failed"), new TypeError("fetch failed")] });
  assert.equal(exit, EXIT.transport);
  assert.equal(calls.length, 3);
  assert.equal(out[0].error.code, "transport_failed");
  assert.equal(out[0].error.retryable, true);
  assert.deepEqual(out[0].error.evidence, { method: "GET", attempts: 3 });
  assert.equal(err[0].code, "transport_failed");
});

test("failure: HTTP statuses map to typed exits and only retryable ones repeat", async () => {
  const cases = [
    [[json(404, { error: "x" })], "not_found", EXIT.not_found, 1],
    [[json(400, { error: "Provide a host" })], "http_refused", EXIT.input, 1],
    [[json(401, {})], "unauthorized", EXIT.auth, 1],
    [[json(429, {}), json(429, {}), json(429, {})], "rate_limited", EXIT.retryable, 3],
    [[json(200, "<html>", { "content-type": "text/html" }), json(200, "<html>", { "content-type": "text/html" }), json(200, "<html>", { "content-type": "text/html" })], "response_invalid", EXIT.transport, 3],
    [[json(302, "", { location: "https://elsewhere.example", "content-type": "text/html" })], "origin_refused", EXIT.origin, 1],
  ];
  for (const [answers, code, exitCode, count] of cases) {
    const result = await run(["readiness", "check", "--host", "example.com"], { answers });
    assert.equal(result.out[0].error.code, code);
    assert.equal(result.exit, exitCode, code);
    assert.equal(result.calls.length, count, code);
  }
});

test("failure: a wrong report schema is refused, not passed through", async () => {
  const { exit, out } = await run(["readiness", "check", "--host", "example.com"], { answers: [json(200, { schema: "other" })] });
  assert.equal(exit, EXIT.transport);
  assert.equal(out[0].error.code, "response_invalid");
});

test("an existing --out file is refused before any request", async () => {
  const dir = tempDir();
  const file = join(dir, "taken.json");
  writeFileSync(file, "{}", { mode: 0o600 });
  const { exit, out, calls } = await run(["readiness", "check", "--host", "example.com", "--out", file]);
  assert.equal(exit, EXIT.conflict);
  assert.equal(out[0].error.code, "output_exists");
  assert.equal(calls.length, 0);
  const relative = await run(["readiness", "check", "--host", "example.com", "--out", "result.json"]);
  assert.equal(relative.out[0].error.code, "absolute_private_file_required");
});

test("result show refuses a tampered or world-readable record", async () => {
  const dir = tempDir();
  const file = join(dir, "r.json");
  await run(["readiness", "check", "--host", "example.com", "--out", file], { answers: [json(200, REPORT)] });
  const record = JSON.parse(readFileSync(file, "utf8"));
  record.report.score = 100;
  const tampered = join(dir, "tampered.json");
  writeFileSync(tampered, JSON.stringify(record), { mode: 0o600 });
  const bad = await run(["result", "show", "--file", tampered]);
  assert.equal(bad.out[0].error.code, "result_file_invalid");
  chmodSync(file, 0o644);
  const open = await run(["result", "show", "--file", file]);
  assert.equal(open.out[0].error.code, "result_file_invalid");
});

test("origin rules: only https, or loopback http with --allow-loopback", async () => {
  const plain = await run(["readiness", "check", "--host", "example.com", "--origin", "http://example.com"]);
  assert.equal(plain.exit, EXIT.origin);
  const path = await run(["readiness", "check", "--host", "example.com", "--origin", "https://samedaydesk.com/x"]);
  assert.equal(path.exit, EXIT.origin);
  const loop = await run(["readiness", "check", "--host", "example.com", "--origin", "http://127.0.0.1:8787", "--allow-loopback"], { answers: [json(200, REPORT)] });
  assert.equal(loop.exit, 0);
  assert.equal(loop.calls[0].url, "http://127.0.0.1:8787/agent-readiness?host=example.com&format=json");
});

test("dry-run returns the request and sends nothing", async () => {
  const { exit, out, calls } = await run(["readiness", "check", "--host", "example.com", "--dry-run"]);
  assert.equal(exit, 0);
  assert.equal(calls.length, 0);
  assert.deepEqual(out[0].result.request, { method: "GET", url: "https://samedaydesk.com/agent-readiness?host=example.com&format=json" });
  assert.equal(out[0].result.sent, false);
});

test("gateway quote reads stdin and returns a non-executable preview", async () => {
  const quote = { schema: "neomorphic.machine-gateway.quote.v1", quoteId: "00000000-0000-4000-8000-000000000000", routeId: "lockfile.delta", tenantBound: false, executable: false, price: { amount: 0, unit: "usd-micros" } };
  const stdin = Readable.from([Buffer.from('{"before":"a","after":"b"}')]);
  const { exit, out, calls } = await run(["gateway", "quote", "--route", "lockfile.delta", "--input-file", "-"], { answers: [json(200, quote)], stdin });
  assert.equal(exit, 0);
  assert.equal(calls[0].method, "POST");
  assert.deepEqual(calls[0].body, { routeId: "lockfile.delta", input: { before: "a", after: "b" } });
  assert.equal(calls[0].headers.authorization, undefined);
  assert.equal(calls[0].headers["idempotency-key"], undefined);
  assert.equal(out[0].result.preview, true);
  assert.equal(out[0].result.executable, false);
  assert.match(out[0].result.requiredAuthorityForNextStep.execute, /tenantBearer/);
});

test("gateway quote refuses invalid JSON input before sending", async () => {
  const stdin = Readable.from([Buffer.from("{not json")]);
  const { exit, out, calls } = await run(["gateway", "quote", "--route", "lockfile.delta", "--input-file", "-"], { stdin });
  assert.equal(exit, EXIT.input);
  assert.equal(out[0].error.code, "invalid_input");
  assert.equal(calls.length, 0);
});

test("POST is never retried: gateway test with a 503 is one call", async () => {
  const { exit, out, calls } = await run(["gateway", "test", "--route", "lockfile.delta"], { answers: [json(503, { error: { code: "store_unavailable" } }), json(200, {})] });
  assert.equal(exit, EXIT.unavailable);
  assert.equal(calls.length, 1);
  assert.equal(out[0].error.evidence.method, "POST");
});

test("gateway schema and routes read the advertised paths", async () => {
  const schema = await run(["gateway", "schema", "--route", "http.capture", "--kind", "output"], { answers: [json(200, { type: "object" })] });
  assert.equal(schema.calls[0].url, "https://samedaydesk.com/api/machine-gateway/v1/routes/http.capture/output.schema.json");
  assert.deepEqual(schema.out[0].result, { type: "object" });
  const routes = await run(["gateway", "routes"], { answers: [json(200, DISCOVER)] });
  assert.equal(routes.out[0].result.routes[0].id, "lockfile.delta");
  const badRoute = await run(["gateway", "schema", "--route", "../x"]);
  assert.equal(badRoute.out[0].error.code, "invalid_input");
});

test("market discover --stream emits JSONL pages and a terminal record", async () => {
  const page = (items, nextCursor) => json(200, { ok: true, value: { items, nextCursor } });
  const { exit, out, calls } = await run(["market", "discover", "--stream", "--limit", "1"], { answers: [page([{ taskId: "a" }], "c1"), page([{ taskId: "b" }], null)] });
  assert.equal(exit, 0);
  assert.equal(calls[1].url, "https://samedaydesk.com/api/neomorphic-contributor-journey/v1/market/discover?limit=1&cursor=c1");
  assert.deepEqual(out.map(line => line.type), ["page", "page", "end"]);
  assert.ok(out.every(line => line.schema === "samedaydesk.cli.stream.v1"));
  assert.deepEqual(out[2], { schema: "samedaydesk.cli.stream.v1", type: "end", command: "market.discover", ok: true, pages: 2, count: 2, nextCursor: null });
});

test("market discover --stream failure ends with a resumable terminal record", async () => {
  const page = json(200, { ok: true, value: { items: [{ taskId: "a" }], nextCursor: "c1" } });
  const { exit, out } = await run(["market", "discover", "--stream", "--limit", "1"], { answers: [page, json(400, { ok: false, code: "cursor_refused" })] });
  assert.equal(exit, EXIT.input);
  const end = out.at(-1);
  assert.equal(end.type, "end");
  assert.equal(end.ok, false);
  assert.equal(end.resumeCursor, "c1");
  assert.equal(end.error.code, "http_refused");
});
