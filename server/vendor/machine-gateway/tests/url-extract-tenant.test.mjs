// AE21 U1 MUST-FAIL tenant isolation for url.extract.*.
// Each test FAILS on 667fba35 + X1 gateway-url-extract.patch alone (one global
// extraction tenant) and PASSES with the AE21 U1 tenant pass-through.
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { fixture, TOKEN_A, TOKEN_B } from "./helpers.mjs";
import { builtinRoutes } from "../src/providers.mjs";
import { bindUrlExtractService, unbindUrlExtractService } from "../src/url-extract-routes.mjs";

// In-memory stand-in with the ExtractionService surface the provider uses:
// submit/read/pump plus pool.query for the extraction_job row. Tenant ids are
// whatever the provider passes; this fake never infers one.
function fakeExtraction() {
  const jobs = new Map(), keys = new Map();
  const counts = { submit: 0, created: 0 };
  let next = 0;
  const key = (tenantId, jobId) => `${tenantId}\u0000${jobId}`;
  const view = job => ({ ok: true, jobId: job.jobId, state: "ready", resultDigest: job.digest,
    reason: null, fetchMode: "fixture", paymentAttempts: 0, newPayment: false });
  return {
    counts,
    pool: {
      async query(_sql, [jobId, tenantId]) {
        const job = jobs.get(key(tenantId, jobId));
        return { rows: job ? [{ result_bytes: job.bytes, result_digest: job.digest, fetch_mode: "fixture",
          state: "ready", reason: null, attempts: 1, payment_attempts: 0 }] : [] };
      },
    },
    async submit({ tenantId, actorId, url, idempotencyKey }) {
      counts.submit++;
      assert.equal(typeof tenantId, "string"); assert.equal(typeof actorId, "string");
      const idem = `${tenantId}\u0000${idempotencyKey}`;
      if (keys.has(idem)) return view(jobs.get(key(tenantId, keys.get(idem))));
      const jobId = `j${(++next).toString(16).padStart(32, "0")}`;
      const bytes = Buffer.from(JSON.stringify({ title: `fixture ${next}`, status: 200, requestedUrl: url }));
      const job = { jobId, bytes, digest: createHash("sha256").update(bytes).digest("hex") };
      jobs.set(key(tenantId, jobId), job); keys.set(idem, jobId); counts.created++;
      return view(job);
    },
    async read({ tenantId, jobId }) {
      const job = jobs.get(key(tenantId, jobId));
      return job ? view(job) : null;
    },
    async pump() { return 0; },
  };
}

async function bound(t) {
  const service = fakeExtraction();
  bindUrlExtractService({ service, tenantId: "sds", actorId: "gateway", schema: "ae19_paid_continuation" });
  t.after(() => unbindUrlExtractService());
  return { service, f: await fixture(t) };
}

async function call(f, routeId, input, token, key) {
  const body = await f.quote(input, routeId, token);
  return (await f.execute(body, key, { token })).body;
}

async function submitAsA(f) {
  const receipt = await call(f, "url.extract.submit", { url: "https://example.com/a", idempotencyKey: "tenant-a-key-0001" }, TOKEN_A, "gw-a-submit-000001");
  assert.equal(receipt.status, "completed");
  return receipt.output.jobId;
}

test("MUST-FAIL: tenant B cannot read tenant A's job via url.extract.result", async t => {
  const { f } = await bound(t);
  const jobId = await submitAsA(f);
  const own = await call(f, "url.extract.result", { jobId }, TOKEN_A, "gw-a-result-000001");
  assert.equal(own.status, "completed"); assert.equal(own.output.jobId, jobId);
  const other = await call(f, "url.extract.result", { jobId }, TOKEN_B, "gw-b-result-000001");
  assert.equal(other.status, "failed");
  assert.equal(other.error.code, "e08_job_forbidden");
  assert.equal(other.output, null);
});

test("MUST-FAIL: tenant B cannot poll tenant A's job via url.extract.poll", async t => {
  const { f } = await bound(t);
  const jobId = await submitAsA(f);
  const other = await call(f, "url.extract.poll", { jobId }, TOKEN_B, "gw-b-poll-00000001");
  assert.equal(other.status, "failed");
  assert.equal(other.error.code, "e08_job_forbidden");
});

test("MUST-FAIL: a provider call with no gateway tenant is refused", async t => {
  const { service } = await bound(t);
  const routes = Object.fromEntries(builtinRoutes().map(route => [route.id, route]));
  const signal = new AbortController().signal;
  for (const [id, input] of [["url.extract.submit", { url: "https://example.com/x", idempotencyKey: "no-tenant-key-01" }],
    ["url.extract.poll", { jobId: `j${"1".repeat(32)}` }], ["url.extract.result", { jobId: `j${"1".repeat(32)}` }]]) {
    await assert.rejects(routes[id].run(input, { signal }), error => error.code === "tenant_required" && error.status === 401, id);
    await assert.rejects(routes[id].run(input, { signal, tenantId: "" }), error => error.code === "tenant_required", id);
  }
  assert.equal(service.counts.submit, 0);
});

test("unauthenticated execute stays 401 (control, passes before and after)", async t => {
  const { f } = await bound(t);
  const response = await f.request("/v1/execute", { token: null, body: { quoteId: "00000000-0000-4000-8000-000000000000", input: {}, maxUnits: 0 },
    headers: { "idempotency-key": "gw-anon-000000001" } });
  assert.equal(response.status, 401);
});

test("MUST-FAIL: the extraction idempotency key is scoped per gateway tenant", async t => {
  const { f, service } = await bound(t);
  const input = { url: "https://example.com/same", idempotencyKey: "shared-body-key-01" };
  const a = await call(f, "url.extract.submit", input, TOKEN_A, "gw-a-idem-00000001");
  const b = await call(f, "url.extract.submit", input, TOKEN_B, "gw-b-idem-00000001");
  assert.equal(a.status, "completed"); assert.equal(b.status, "completed");
  assert.notEqual(b.output.jobId, a.output.jobId, "tenant B must not receive tenant A's job for the same body key");
  assert.equal(service.counts.created, 2);
  // Same tenant, same body key, new gateway key: same job, no second extraction.
  const again = await call(f, "url.extract.submit", input, TOKEN_A, "gw-a-idem-00000002");
  assert.equal(again.output.jobId, a.output.jobId);
  assert.equal(service.counts.created, 2);
});
