import test from "node:test";
import assert from "node:assert/strict";
import { buildRecord, discoveryLogMiddleware, qaProof } from "./log.js";

const S = "s".repeat(32), J = "j".repeat(32), now = () => new Date("2026-10-20T10:00:00Z");
const req = (o = {}) => ({ method: "GET", path: "/llms.txt", headers: {}, query: {}, ...o });
const rec = (o, opts = {}) => buildRecord(req(o), { now, secret: S, journeySecret: J, ...opts });

test("stage-1 record shape, joinable fields, no PII", () => {
  const { record } = rec({ headers: { "x-samedaydesk-agent-source": "llms-txt-v1", referer: "https://github.com/a/b/issues/1", "x-samedaydesk-journey": "tok_abcdefghijklmnop", "user-agent": "Claude-User/1.0 (1.2.3.4)" }, query: { source: "https://github.com/MikeyPetrillo/Agent402/issues/1047" } });
  assert.equal(record.stage, "discovery"); assert.equal(record.declaredSource, "llms-txt");
  assert.equal(record.discoveryRef, "https://github.com/MikeyPetrillo/Agent402/issues/1047");
  assert.equal(record.discoveryReferrer, "https://github.com/a/b/issues/1");
  assert.match(record.journeyDigest, /^hmac-sha256:[0-9a-f]{64}$/); assert.equal(record.observedAgentClass, "claude");
  assert.equal(record.requesterId, null); assert.equal(record.usefulKind, null);
  const text = JSON.stringify(record); assert.ok(!text.includes("1.2.3.4")); assert.ok(!text.includes("tok_abcdefghijklmnop")); assert.ok(!text.includes("Claude-User"));
});
test("F-missing-key: no header/source/referrer => nulls, not guessed", () => {
  const { record } = rec();
  for (const k of ["declaredSource", "discoveryRef", "discoveryReferrer", "journeyDigest"]) assert.equal(record[k], null);
});
test("journey secret shorter than 32 characters does not digest", () => {
  const { record } = rec({ headers: { "x-samedaydesk-journey": "tok_abcdefghijklmnop" } }, { journeySecret: "j".repeat(31) });
  assert.equal(record.journeyDigest, null);
  assert.equal(rec({ headers: { "x-samedaydesk-journey": "tok_abcdefghijklmnop" } }, { journeySecret: "" }).record.journeyDigest, null);
});
test("F-spoofed-source: unknown label dropped and flagged; unsafe source withheld", () => {
  const { record } = rec({ headers: { "x-samedaydesk-agent-source": "bazaar-top-1" }, query: { source: "a b\u0000c" } });
  assert.equal(record.declaredSource, null); assert.equal(record.declaredSourceDropped, true);
  assert.equal(record.discoveryRef, null); assert.equal(record.discoveryRefWithheld, true);
});
test("referrer with query/credentials is withheld, never rewritten", () => {
  assert.equal(rec({ headers: { referer: "https://x.test/p?email=a@b" } }).record.referrerWithheld, "query-or-credentials");
  assert.equal(rec({ headers: { referer: "https://u:p@x.test/p" } }).record.discoveryReferrer, null);
});
test("F-qa-leakage: verified owner-qa never written; unverified claim kept as unknown", () => {
  const m = "owner-qa-run-000000001";
  assert.equal(rec({ headers: { "x-samedaydesk-owner-qa": m, "x-samedaydesk-owner-qa-proof": qaProof(S, m) } }).skip, "owner-qa");
  const r = rec({ headers: { "x-samedaydesk-owner-qa": m, "x-samedaydesk-owner-qa-proof": "0".repeat(64) } }).record;
  assert.equal(r.qaClaimUnverified, true); assert.equal(r.callerClass, "unknown");
  assert.equal(rec({ headers: { "user-agent": "owner-qa probe" } }, { secret: "" }).record.callerClass, "unknown");
});
test("F-duplicate: each request is its own append-only line with a distinct requestId", () => {
  const lines = []; const mw = discoveryLogMiddleware({ sink: (r) => lines.push(r), now, secret: S, journeySecret: J });
  mw(req(), {}, () => {}); mw(req(), {}, () => {});
  assert.equal(lines.length, 2); assert.notEqual(lines[0].requestId, lines[1].requestId);
});
test("F-cross-origin/unknown route: only allow-listed apex routes are logged", () => {
  assert.equal(rec({ path: "/redirect-to-other-origin" }).skip, "route");
  assert.equal(rec({ method: "POST", path: "/mcp", body: { method: "tools/list" } }).record.mcpMethod, "tools/list");
});
test("sink failure never breaks the request", () => {
  let called = false; const mw = discoveryLogMiddleware({ sink: () => { throw new Error("disk"); }, now });
  mw(req(), {}, () => { called = true; }); assert.equal(called, true); assert.equal(mw.counters.errors, 1);
});
test("seeded failure must fail: a sink that writes owner-qa", () => {
  const m = "owner-qa-run-000000001"; const lines = [];
  const leaky = (r) => lines.push(r); const mw = discoveryLogMiddleware({ sink: leaky, now, secret: S });
  mw(req({ headers: { "x-samedaydesk-owner-qa": m, "x-samedaydesk-owner-qa-proof": qaProof(S, m) } }), {}, () => {});
  assert.equal(lines.length, 0, "owner-qa leaked into the discovery log");
});
