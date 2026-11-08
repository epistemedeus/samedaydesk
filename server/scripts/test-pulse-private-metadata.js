import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { safePulseMetadata } from "./pulse-private-read.js";

const project = value => safePulseMetadata(200, Buffer.from(JSON.stringify(value)));

test("preserves the configured database start instant without losing microseconds", () => {
  const startedAt = "2026-09-02T04:11:48.347229+00:00";
  const now = "2026-11-08T14:26:12.748Z";
  assert.deepEqual(project({ startedAt, now }).window, { startedAt, now });
  const nonUTC = "2024-02-29T18:20:00.123456-05:30";
  assert.equal(project({ startedAt: nonUTC }).window.startedAt, nonUTC);
});

test("refuses invalid or unzoned clocks while retaining valid zero precision", () => {
  const bad = [null, "2026-02-29T00:00:00Z", "2024-04-31T00:00:00Z", "2026-01-01T24:00:00Z",
    "2026-01-01T00:00:00+24:00", "2026-01-01T00:00:00.123", "2026-01-01T00:00:00Z\n", "yesterday"];
  for (const value of bad) assert.equal(project({ startedAt: value }).window.startedAt, null, String(value));
  const start = "2026-01-01T00:00:00Z";
  assert.equal(project({ startedAt: start }).window.startedAt, start);
});

test("preserves incomplete producer and outcome coverage without emitting raw details", () => {
  const bytes = Buffer.from(JSON.stringify({ total: 659434, complete: false, authority: "incomplete_local_fallback",
    pending: { total: 4, byPath: { "/secret": 1 } },
    freeTool: { requests: 1, complete: false, coverage: "lower_bound_from_first_observation",
      observedFrom: "2026-11-07T20:12:13.381Z", outcomes: { completed: 1, timeout: 0, arbitrary: 200 },
      reportedAcquisition: { private: "never export" } } }));
  const result = safePulseMetadata(200, bytes);
  assert.deepEqual(result.coverage, { complete: false, authority: "incomplete_local_fallback", pendingRequests: 4,
    freeTool: { route: "/api/tools/ai-readiness", complete: false, coverage: "lower_bound_from_first_observation", observedFrom: "2026-11-07T20:12:13.381Z",
      outcomes: { completed: 1, invalid_host: null, unreachable: null, timeout: 0, abandoned: null, other_failure: null } } });
  assert.equal(result.counts.freeToolRequests, 1);
  assert.equal(result.digest.hex, createHash("sha256").update(bytes).digest("hex"));
  assert.doesNotMatch(JSON.stringify(result), /secret|never export|arbitrary/);
});

test("does not turn a missing, malformed, or unrecognized field into a zero or complete window", () => {
  const result = project({ complete: "true", authority: "untrusted", pending: { total: -1 },
    freeTool: { complete: 1, coverage: "future", observedFrom: "unknown", outcomes: { completed: 0.5, timeout: "0" } } });
  assert.deepEqual(result.coverage, { complete: null, authority: null, pendingRequests: null, freeTool: {
    route: "/api/tools/ai-readiness", complete: null, coverage: null, observedFrom: null, outcomes: Object.fromEntries(
      ["completed", "invalid_host", "unreachable", "timeout", "abandoned", "other_failure"].map(key => [key, null])) } });
  assert.deepEqual(project({}).coverage, result.coverage);
  assert.equal(project({ complete: true, authority: "durable_atomic_aggregate", pending: { total: 0 } }).coverage.pendingRequests, 0);
  assert.equal(project({ freeTool: { complete: false, coverage: "unknown" } }).coverage.freeTool.coverage, "unknown");
});
