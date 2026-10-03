import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createServer } from "node:http";
import { mkdtemp, writeFile, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { Budget, readFileBounded, runChild } from "../lib/budget.mjs";
import { createJourneyRouter } from "../lib/router.mjs";
import { openJourneyFromEnv } from "../lib/service.mjs";
import { UsefulJourneyClient } from "../client.mjs";
import { validateRequest } from "../lib/contracts.mjs";
import { executeRecipe } from "../lib/executor.mjs";
import { cold, example } from "./support.mjs";

async function server(t, handler) {
  const s = createServer(handler);
  await new Promise(resolve => s.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise(resolve => { s.close(resolve); s.closeAllConnections(); }));
  return `http://127.0.0.1:${s.address().port}`;
}

test("unconfigured public evaluation executes caller bytes and is distinct from admission", async t => {
  const app = express(); app.use("/api/hosted-useful", createJourneyRouter());
  const origin = await server(t, app);
  const input = await example("page-watch");
  const evaluated = await new UsefulJourneyClient({ origin }).evaluate(input);
  assert.equal(evaluated.mode, "public-evaluation"); assert.equal(evaluated.admitted, false);
  assert.equal(evaluated.result.recipe.evidence.changed[0].after, "SDK 2.0");
  const health = await fetch(`${origin}/api/hosted-useful/healthz`).then(r => r.json());
  assert.equal(health.enabled, false); assert.equal(health.publicationVerified, false);
  const response = await fetch(`${origin}/api/hosted-useful/projects/prj_qa/jobs`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, "unconfigured");
});

test("HTTP service key, product storage reuse and absent enrollment stay conditional", async () => {
  assert.equal((await openJourneyFromEnv({})).reason, "unconfigured");
  assert.equal((await openJourneyFromEnv({ HOSTED_USEFUL_JOURNEY_OPT_IN: "1", FOUNDRY_HOST_OPT_IN: "1",
    CORRESPONDENCE_DATABASE_URL: "https://qa.supabase.co", CORRESPONDENCE_ADMIN_TOKEN: "qa-test-key-that-is-not-a-pg-connection" })).reason, "enrolled_postgres_required");
  assert.equal((await openJourneyFromEnv({ HOSTED_USEFUL_JOURNEY_OPT_IN: "1", FOUNDRY_HOST_OPT_IN: "1",
    CORRESPONDENCE_DATABASE_URL: "postgres://qa@db.arvmcttdegqwiwdaembr.supabase.co:5432/postgres", CORRESPONDENCE_ADMIN_TOKEN: "qa-test-key-that-is-not-a-pg-connection" })).reason, "enrolled_postgres_required");
});

test("supplied path, live URL, copied trust and credentials cannot become executable or admitted inputs", async () => {
  const input = await example("page-watch");
  for (const property of ["currentFixturePath", "liveUrl", "fetchImpl", "githubToken", "trusted", "acceptance", "payment"] ) {
    assert.throws(() => validateRequest({ ...input, input: { ...input.input, [property]: "caller-declaration" } }), { code: "invalid_request" });
  }
  input.input.current.data = "sk_live_fake_only_used_by_this_negative_regression";
  assert.throws(() => validateRequest(input), { code: "sensitive_or_unsupported_input" });
});

test("missing-input is useful negative and historical payment never transfers spending authority", async () => {
  const input = await example("page-watch");
  delete input.input.prior;
  const missing = await executeRecipe(validateRequest(input), new Budget());
  assert.equal(missing.result.recipe.evidence.code, "missing_prior");
  assert.equal(missing.result.recipe.ok, false);
  const paid = await example("page-watch"); paid.input.prior.payment = { attempted: true, charged: true };
  const refusal = await executeRecipe(validateRequest(paid), new Budget());
  assert.equal(refusal.result.recipe.payment.replayBlocked, true);
  assert.equal(refusal.result.facts.paymentAttempted, false);
});

test("stdin stall uses the same deadline before any transport starts", async () => {
  const started = performance.now();
  const result = await cold(["evaluate", "--origin", "http://127.0.0.1:1", "--input", "-", "--deadline-ms", "150"], { holdStdin: true });
  assert.equal(result.code, 1); assert.equal(result.json.error.code, "deadline_exceeded");
  assert.ok(performance.now() - started < 1500);
});

test("raw regular-file intake rejects overflow, symlink and FIFO without blocking", async t => {
  const dir = await mkdtemp(join(tmpdir(), "sds-useful-raw-")); t.after(() => rm(dir, { recursive: true, force: true }));
  const large = join(dir, "large.json"); await writeFile(large, " ".repeat(65_537));
  await assert.rejects(readFileBounded(large, new Budget()), { code: "input_too_large" });
  const fifo = join(dir, "caller.pipe"); assert.equal(spawnSync("mkfifo", [fifo], { timeout: 1000 }).status, 0);
  const started = performance.now();
  await assert.rejects(readFileBounded(fifo, new Budget()), { code: "regular_file_required" });
  assert.ok(performance.now() - started < 500);
  const symbolic = join(dir, "link.json"); assert.equal(spawnSync("ln", ["-s", large, symbolic], { timeout: 1000 }).status, 0);
  await assert.rejects(readFileBounded(symbolic, new Budget()), { code: "ELOOP" });
});

test("transport headers and delayed whole response share one caller deadline", async t => {
  const origin = await server(t, (_req, res) => {
    res.writeHead(200, { "content-type": "application/json" }); res.write('{"value":');
    const timer = setTimeout(() => res.end('"too late"}'), 800);
    res.on("close", () => clearTimeout(timer));
  });
  const budget = new Budget({ deadlineMs: 180 });
  const started = performance.now();
  await assert.rejects(new UsefulJourneyClient({ origin, budget }).call("GET", "/slow", undefined, undefined, true), { code: "deadline_exceeded" });
  assert.ok(performance.now() - started < 600);
});

test("caller deadline is propagated to the server before recipe work", async t => {
  const app = express(); app.use("/api/hosted-useful", createJourneyRouter());
  const origin = await server(t, app);
  const input = await example("page-watch");
  const client = new UsefulJourneyClient({ origin, budget: new Budget({ deadlineMs: 1500 }) });
  await assert.rejects(client.evaluate(input), { code: "deadline_exceeded" }); // fixed setup/reserved output cannot fit
  const response = await fetch(`${origin}/api/hosted-useful/evaluate`, { method: "POST", headers: {
    "content-type": "application/json", "x-useful-deadline-at": String(Date.now() - 1) }, body: JSON.stringify(input) });
  assert.equal(response.status, 408);
});

test("output and materialized source bytes consume the shared allowance", async () => {
  const input = validateRequest(await example("issue-brief"));
  const budget = new Budget();
  await executeRecipe(input, budget);
  assert.ok(budget.counts["child-stdin"] > 0);
  assert.ok(budget.counts["child-source-io"] > 0);
  assert.ok(budget.counts["child-stdout"] > 0);
  const tiny = new Budget({ outputBytes: 512 });
  await assert.rejects(executeRecipe(input, tiny), error => ["output_too_large", "executor_failed"].includes(error.code));
});

test("owned child deadline, cancellation and output flood terminate and clean materialized input", async t => {
  const dir = await mkdtemp(join(tmpdir(), "sds-useful-child-qa-")); t.after(() => rm(dir, { recursive: true, force: true }));
  const slow = join(dir, "slow.mjs"); await writeFile(slow, 'setInterval(() => {}, 1000);');
  const before = new Set((await readdir(tmpdir())).filter(name => name.startsWith("sds-useful-owned-")));
  const started = performance.now();
  await assert.rejects(runChild(slow, {}, new Budget({ deadlineMs: 350 }), { reserveMs: 150 }), { code: "execution_deadline" });
  assert.ok(performance.now() - started < 650);
  const controller = new AbortController();
  const cancelled = runChild(slow, {}, new Budget(), { signal: controller.signal });
  setTimeout(() => controller.abort(), 50);
  await assert.rejects(cancelled, { code: "execution_cancelled" });
  const flood = join(dir, "flood.mjs"); await writeFile(flood, 'process.stdout.write("x".repeat(100000)); setInterval(() => {}, 1000);');
  await assert.rejects(runChild(flood, {}, new Budget({ outputBytes: 1024 })), { code: "output_too_large" });
  const after = (await readdir(tmpdir())).filter(name => name.startsWith("sds-useful-owned-") && !before.has(name));
  assert.deepEqual(after, []);
});

test("aggregate allowance is not reset between input and later output", () => {
  const budget = new Budget({ totalBytes: 100 });
  budget.spend(70, "intake");
  assert.throws(() => budget.spend(31, "output"), { code: "allowance_exceeded" });
});

test("anonymous execution inherits bytes already consumed by the caller", async t => {
  const app = express(); app.use("/api/hosted-useful", createJourneyRouter());
  const origin = await server(t, app);
  const response = await fetch(`${origin}/api/hosted-useful/evaluate`, { method: "POST", headers: {
    "content-type": "application/json", "x-useful-total-bytes": "4096", "x-useful-used-bytes": "4000",
    "x-useful-output-bytes": "2048" }, body: JSON.stringify(await example("page-watch")) });
  assert.equal(response.status, 413);
  assert.equal((await response.json()).error.code, "allowance_exceeded");
});

test("backend work and response intake debit the caller's same byte ledger", async t => {
  const origin = await server(t, (_req, res) => {
    res.setHeader("x-useful-used-bytes", "1020");
    res.setHeader("content-type", "application/json");
    res.end('{"value":"delivered"}');
  });
  const budget = new Budget({ totalBytes: 1024 });
  await assert.rejects(new UsefulJourneyClient({ origin, budget }).call("GET", "/work", undefined, undefined, true), { code: "allowance_exceeded" });
});
