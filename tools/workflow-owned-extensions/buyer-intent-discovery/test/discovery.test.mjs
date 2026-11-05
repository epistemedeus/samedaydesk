import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { acquire, buildReport, digest, searchUrl, API_VERSION } from "../src/index.mjs";
const load = async name => JSON.parse(await readFile(new URL(`../fixtures/${name}`, import.meta.url), "utf8"));
const options = { timestamp: "2026-11-05T20:40:00.000Z" };

test("constructed API-shaped fit needs actual snapshots, not invented SDK input", async () => {
  const report = buildReport(await load("fitting-shaped-search.json"), options);
  assert.equal(report.outcome, "fitting_candidates");
  const candidate = report.candidates[0];
  assert.equal(candidate.capability, "sdd.page_change_offline");
  assert.equal(candidate.handoff.executionReady, false);
  assert.ok(candidate.handoff.required.includes("two actual extract-batch snapshots"));
  assert.match(candidate.reasons[0], /explicit_supplied_evidence/);
  assert.equal(report.contacted, false);
});

test("recorded real visual and KBOM requests are not page-change service demand", async () => {
  const report = buildReport(await load("recorded-search.json"), options);
  assert.equal(report.outcome, "no_fit");
  assert.equal(report.counts.nonFitting, 2);
  assert.ok(report.candidates.every(c => c.capability === null && c.reasons.length > 0));
  assert.ok(report.candidates.some(c => c.sourceUrl === "https://github.com/rad-security/kbom/issues/193"));
  assert.match(digest(report), /no_fit/);
});

test("empty result is explicit no-fit, not fabricated demand", async () => {
  const report = buildReport(await load("empty-search.json"), options);
  assert.equal(report.outcome, "no_fit");
  assert.deepEqual(report.counts, { acquired: 0, fitting: 0, nonFitting: 0 });
  assert.deepEqual(report.candidates, []);
  assert.equal(report.acquisition.apiVersion, API_VERSION);
  assert.match(report.directFallback.requestUrl, /^https:\/\/api.github.com\/search\/issues\?/);
});

test("missing title, malformed envelope and unsafe source URL fail closed", () => {
  for (const response of [{}, { items: [], total_count: 0, incomplete_results: "false" },
    { total_count: 1, incomplete_results: false, items: [{ html_url: "https://evil.invalid/issues/1", title: "request" }] }]) {
    assert.throws(() => buildReport(response));
  }
});

test("closed issues, pull requests and implementation requirements cannot be a fit", async () => {
  const fixture = await load("fitting-shaped-search.json");
  for (const override of [{ state: "closed" }, { pull_request: {} }, { body: fixture.items[0].body + " Implement a dashboard." }]) {
    const report = buildReport({ ...fixture, items: [{ ...fixture.items[0], ...override }] }, options);
    assert.equal(report.outcome, "no_fit");
  }
});

test("result-reuse handoff preserves explicit identity and opt-in boundary", () => {
  const report = buildReport({ total_count: 1, incomplete_results: false, items: [{
    id: 2, html_url: "https://github.com/fixture-only/fixture-only/issues/2", state: "open",
    title: "Export already-produced page-change result to task-memory", body: "I need to reuse the already-produced page-change result in task-memory.",
  }] }, options);
  assert.equal(report.candidates[0].capability, "sdd.result_reuse_offline");
  assert.ok(report.candidates[0].handoff.required.includes("explicit opt_in for export"));
});

test("one GET to fixed public API with explicit version, bounded page and no redirects", async () => {
  let calls = 0;
  const result = await acquire({ token: "test-only-not-a-secret", fetchImpl: async (url, request) => {
    calls++;
    assert.equal(new URL(url).host, "api.github.com");
    assert.equal(request.method, "GET");
    assert.equal(request.redirect, "error");
    assert.equal(request.headers["X-GitHub-Api-Version"], API_VERSION);
    return { ok: true, text: async () => '{"items":[],"total_count":0,"incomplete_results":false}' };
  } });
  assert.equal(calls, 1);
  assert.equal(result.total_count, 0);
});

test("rate limits and transport failures do not retry or leak upstream text", async () => {
  let calls = 0;
  await assert.rejects(acquire({ fetchImpl: async () => {
    calls++; return { ok: false, status: 429, text: async () => "upstream-sensitive-text" };
  } }), /HTTP 429; no automatic retry/);
  assert.equal(calls, 1);
  await assert.rejects(acquire({ fetchImpl: async () => { throw new Error("sensitive-text"); } }), /^Error: acquisition transport failed/);
});

test("invalid query, page bounds, oversized and non-JSON responses fail", async () => {
  for (const q of ["is:private foo", "is:public is:issue x OR is:private", "is:public is:pr x"]) assert.throws(() => searchUrl(q));
  assert.throws(() => searchUrl("is:public is:issue x", 101));
  await assert.rejects(acquire({ fetchImpl: async () => ({ ok: true, text: async () => "a".repeat(2097153) }) }), /exceeds/);
  await assert.rejects(acquire({ fetchImpl: async () => ({ ok: true, text: async () => "not JSON" }) }), /invalid JSON/);
});

test("incomplete search remains visibly partial and hostile markup is inert", async () => {
  const fixture = await load("recorded-search.json");
  fixture.incomplete_results = true;
  fixture.items[0].title = '<script>alert(1)</script> [link](https://evil.invalid)';
  const report = buildReport(fixture, options);
  assert.equal(report.acquisition.incompleteResults, true);
  assert.doesNotMatch(digest(report), /<script>|\[link\]/);
});

test("retained JSON and markdown match the actual recorded fixture replay", async () => {
  const retained = JSON.parse(await readFile(new URL("../examples/recorded-no-fit.json", import.meta.url), "utf8"));
  const report = buildReport(await load("recorded-search.json"), {
    query: retained.acquisition.query, timestamp: retained.acquisition.timestamp,
    mode: retained.acquisition.mode, perPage: retained.acquisition.perPage,
  });
  assert.deepEqual(retained, report);
  assert.equal(await readFile(new URL("../examples/recorded-no-fit.md", import.meta.url), "utf8"), digest(report));
});
