import assert from "node:assert/strict";
import test from "node:test";
import { AGENTS_LLMS_URL, AGENTS_SKILLS_URL, APEX_FOR_AGENTS_URL, MAX_BODY_BYTES, loadCaptureMeta, resolveForAgentsColdRead, sha256File } from "./for-agents-cold-read.mjs";

const valid = (url) => new Response(url === AGENTS_SKILLS_URL ? JSON.stringify({ skills: [{ name: "page-change" }] }) : "SameDayDesk public discovery");
const failApex = (fallback = valid) => async (url) => {
  if (url === APEX_FOR_AGENTS_URL) throw new TypeError("fetch failed");
  return fallback(url);
};

test("dated fixtures match the declared bytes", () => {
  for (const alt of loadCaptureMeta().freeAlternates) assert.equal(sha256File(alt.bodyFile), alt.sha256);
  assert.throws(() => sha256File("../../package.json"), /unknown_fixture/);
});
test("apex success actually reads the body without fallback calls", async () => {
  const calls = [];
  const result = await resolveForAgentsColdRead({ fetchImpl: async (url, init) => {
    calls.push(url); assert.equal(init.redirect, "error"); assert.ok(init.signal); return valid(url);
  }});
  assert.deepEqual(calls, [APEX_FOR_AGENTS_URL]);
  assert.equal(result.outcome, "apex_live");
  assert.match(result.sources[0].body, /SameDayDesk/);
  assert.equal(result.paid, false);
});
test("transport failure performs both real alternate fetches and retains apex failure", async () => {
  const calls = [];
  const result = await resolveForAgentsColdRead({ fetchImpl: async (url, init) => {
    calls.push(url); assert.equal(init.redirect, "error"); return failApex()(url);
  }});
  assert.deepEqual(calls, [APEX_FOR_AGENTS_URL, AGENTS_LLMS_URL, AGENTS_SKILLS_URL]);
  assert.equal(result.outcome, "alternate_live");
  assert.equal(result.sources.length, 2);
  assert.equal(result.apex.ok, false);
  assert.equal(result.coverage, "partial_discovery_not_apex_guide");
  assert.ok(result.sources.every((s) => s.body && s.observedAt && s.sha256));
});
test("HTTP failure is retained as HTTP failure, not relabeled TLS", async () => {
  const result = await resolveForAgentsColdRead({ fetchImpl: async (url) => url === APEX_FOR_AGENTS_URL ? new Response("missing", { status: 404 }) : valid(url) });
  assert.equal(result.apex.status, 404);
  assert.equal(result.apex.errorClass, "http_error");
  assert.equal(result.outcome, "alternate_live");
});
test("invalid and unavailable live alternates never silently become fixture success", async () => {
  const result = await resolveForAgentsColdRead({ fetchImpl: failApex(() => new Response("not an index")) });
  assert.equal(result.outcome, "unavailable");
  assert.equal(result.sources.length, 0);
  assert.equal(result.liveObserved, false);
});
test("one available alternate remains explicitly partial", async () => {
  const result = await resolveForAgentsColdRead({ fetchImpl: failApex((url) => url === AGENTS_SKILLS_URL ? new Response("{}", { status: 503 }) : valid(url)) });
  assert.equal(result.outcome, "alternate_live");
  assert.equal(result.sources.length, 1);
  assert.equal(result.alternates[1].ok, false);
});
test("streaming and declared oversized bodies are canceled and rejected", async () => {
  let canceled = 0;
  const result = await resolveForAgentsColdRead({ fetchImpl: async (url) => {
    if (url === APEX_FOR_AGENTS_URL) return new Response(new ReadableStream({ start(c) { c.enqueue(new Uint8Array(MAX_BODY_BYTES + 1)); }, cancel() { canceled++; } }));
    return new Response("SameDayDesk", { headers: { "content-length": String(MAX_BODY_BYTES + 1) } });
  }});
  assert.equal(result.outcome, "unavailable");
  assert.equal(result.apex.errorClass, "body_too_large");
  assert.equal(canceled, 1);
});
test("unexpected redirected response cannot be claimed as an allowed source", async () => {
  const result = await resolveForAgentsColdRead({ fetchImpl: async () => {
    const response = valid(APEX_FOR_AGENTS_URL);
    Object.defineProperty(response, "url", { value: "https://example.invalid/elsewhere" });
    return response;
  }});
  assert.equal(result.outcome, "unavailable");
  assert.equal(result.apex.errorClass, "unexpected_response_url");
});
test("offline fixture mode makes zero network calls and names historical evidence", async () => {
  const result = await resolveForAgentsColdRead({ preferFixture: true, fetchImpl: () => { throw new Error("network forbidden"); } });
  assert.equal(result.outcome, "offline_fixture");
  assert.equal(result.liveObserved, false);
  assert.ok(result.sources.every((s) => s.source === "fixture" && s.capturedAt && s.captureAuthority === "worker_reported"));
});
