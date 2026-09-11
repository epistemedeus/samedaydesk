import assert from "node:assert/strict";
import test from "node:test";
import { ingestAdapter, TEST_NOW, mockHttp } from "./helpers.mjs";
import { adapters } from "../src/adapters/index.mjs";
import { reconcile } from "../src/reconcile.mjs";
import { rank } from "../src/rank.mjs";

test("source outage yields partial fetchMeta and no invented jobs", async () => {
  const get = mockHttp(async () => ({
    ok: false,
    httpStatus: 503,
    body: null,
    fetchedAt: TEST_NOW,
    sha256: null,
    error: "http_503",
  }));
  const r = await adapters.moltjobs.fetchList({ mode: "live", now: TEST_NOW, httpGet: get, limit: 5 });
  assert.equal(r.fetchMeta.partial, true);
  assert.equal(r.fetchMeta.httpStatus, 503);
  assert.equal(r.listingMeta.kind, "outage");
  assert.deepEqual(r.records, []);
  assert.equal(r.error, "http_503");
});

test("frantic outage is honest", async () => {
  const get = mockHttp(async () => ({
    ok: false,
    httpStatus: null,
    body: null,
    fetchedAt: TEST_NOW,
    sha256: null,
    error: "timeout",
  }));
  const r = await adapters.frantic.fetchList({ mode: "live", now: TEST_NOW, httpGet: get });
  assert.equal(r.listingMeta.outage, true);
  assert.equal(r.records.length, 0);
});

test("duplicate same adapter+nativeId keeps one and records drop count", async () => {
  const a = await ingestAdapter("frantic", "frantic-board.open.fixture.json");
  const b = await ingestAdapter("frantic", "edge-duplicate.frantic.fixture.json");
  const rec = reconcile([...a.records, ...b.records]);
  const n130 = rec.records.filter((r) => r.source.nativeId === "130" && r.source.adapter === "frantic");
  assert.equal(n130.length, 1);
  assert.ok(rec.droppedExactDuplicates >= 1);
});

test("stale terms: same nativeId different note flags termsDrift", async () => {
  const a = await ingestAdapter("frantic", "edge-stale-terms-a.frantic.fixture.json");
  const b = await ingestAdapter("frantic", "edge-stale-terms-b.frantic.fixture.json");
  assert.notEqual(a.records[0].termsVersion, b.records[0].termsVersion);
  const rec = reconcile([...a.records, ...b.records]);
  assert.ok(rec.termsDrift.length >= 1);
  assert.equal(rec.termsDrift[0].staleTerms, true);
  const kept = rec.records.find((r) => r.source.nativeId === "506");
  assert.equal(kept.revision.staleTerms, true);
  assert.ok(kept.revision.previousTermsVersion);
});

test("moltbook live failure stays inaccessible", async () => {
  const get = mockHttp(async () => ({
    ok: false,
    httpStatus: null,
    body: null,
    fetchedAt: TEST_NOW,
    sha256: null,
    error: "getaddrinfo ENOTFOUND api.moltbook.com",
  }));
  const r = await adapters.moltbook.fetchList({ mode: "live", now: TEST_NOW, httpGet: get });
  assert.equal(r.records[0].source.inaccessible, true);
  assert.equal(rank(r.records, {}, { now: TEST_NOW }).ranked.length, 0);
});
