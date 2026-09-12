import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runPaidOffer } from "../lib/wrapper.mjs";
import { createExecutionServer, listenExecutionServer } from "../lib/http.mjs";
import { seedFromD01Execution } from "../../../tools/result-mailbox/lib/d01-receipt.mjs";
import { writeEnvelopeFiles, readEnvelope } from "../../../tools/result-mailbox/lib/store.mjs";
import { buildEnvelope } from "../../../tools/result-mailbox/lib/envelope.mjs";
import { pickup } from "../../../tools/result-mailbox/lib/pickup.mjs";
import { verifyComplete } from "../../../tools/job-output-atomicity/index.mjs";

const repo = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const root = mkdtempSync(join(tmpdir(), "cw26-boundary-"));
const children = new Set();
const ended = (p) => p.exitCode !== null || p.signalCode !== null;
after(async () => {
  for (const p of children) if (!ended(p)) p.kill("SIGKILL");
  await Promise.all([...children].map((p) => ended(p) ? null : new Promise((r) => p.once("exit", r))));
  rmSync(root, { recursive: true, force: true });
});
const clock = "2026-09-12T06:20:00Z", expiresAt = "2026-09-12T07:20:00Z";
const request = () => ({ jobId: "vendor-budget-impact", inputs: {
  before: { rows: [{ field: "cw26-input", value: 71, unit: "USD/unit" }] },
  after: { rows: [{ field: "cw26-input", value: 72, unit: "USD/unit" }] },
} });
function tracked(script, args = [], env = {}) {
  const p = spawn(process.execPath, [script, ...args], { cwd: repo, env: { ...process.env, NODE_OPTIONS: "--max-old-space-size=768", ...env }, stdio: ["ignore", "pipe", "pipe"] });
  children.add(p); p.stdoutText = ""; p.stderrText = "";
  p.stdout.on("data", (b) => { p.stdoutText += b; }); p.stderr.on("data", (b) => { p.stderrText += b; });
  return p;
}
async function until(check, message) {
  const start = Date.now();
  while (!check()) { if (Date.now() - start > 15000) throw Error(message); await new Promise((r) => setTimeout(r, 15)); }
}
async function realServer() {
  const child = tracked(join(repo, "server/paid-useful-jobs/bin/serve-execution.mjs"), [], { PORT: "0", HOST: "127.0.0.1" });
  await until(() => { if (ended(child)) throw Error(child.stderrText); return child.stdoutText.includes("\n"); }, "server start");
  return { child, origin: JSON.parse(child.stdoutText.trim().split("\n")[0]).origin };
}
async function stop(p) { if (!ended(p)) { p.kill("SIGTERM"); await new Promise((r) => p.once("exit", r)); } children.delete(p); }
async function post(origin, body) {
  const r = await fetch(origin + "/execute", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return { status: r.status, body: await r.json() };
}
async function close(server) { server.closeAllConnections(); await new Promise((r) => server.close(r)); }

test("real HTTP process binds keys to canonical requests and current file bytes", async () => {
  const { child, origin } = await realServer();
  try {
    const first = await post(origin, { ...request(), executionId: "key" });
    assert.equal(first.body.ok, true, JSON.stringify(first.body));
    const retry = await post(origin, { executionId: "key", ...request() });
    assert.equal(retry.body.runOutDir, first.body.runOutDir);
    const changed = request(); changed.inputs.after.rows[0].value = 99;
    assert.equal((await post(origin, { ...changed, executionId: "key" })).status, 409);
    const before = join(root, "before.json"), afterPath = join(root, "after.json");
    writeFileSync(before, JSON.stringify(request().inputs.before)); writeFileSync(afterPath, JSON.stringify(request().inputs.after));
    const body = { jobId: "vendor-budget-impact", inputs: { before, after: afterPath }, executionId: "file-key" };
    assert.equal((await post(origin, body)).body.ok, true);
    writeFileSync(afterPath, JSON.stringify(changed.inputs.after));
    assert.equal((await post(origin, body)).status, 409);
  } finally { await stop(child); }
});
test("malformed result URL does not terminate the actual HTTP process", async () => {
  const { child, origin } = await realServer();
  try { assert.equal((await fetch(origin + "/results/%")).status, 400); assert.equal((await fetch(origin + "/health")).status, 200); assert.equal(ended(child), false); }
  finally { await stop(child); }
});
test("HTTP validates request objects and bounded execution IDs", async () => {
  const { child, origin } = await realServer();
  try { for (const body of [null, [], { ...request(), executionId: {} }, { ...request(), executionId: "../escape" }]) assert.equal((await post(origin, body)).status, 400); }
  finally { await stop(child); }
});
test("concurrent identical keys coalesce while changed pending requests conflict", async () => {
  let calls = 0, release; const gate = new Promise((r) => { release = r; });
  const { server } = createExecutionServer({ execute: async (r) => { calls++; await gate; return { ok: true, executionId: r.executionId }; } });
  const { origin } = await listenExecutionServer(server);
  try {
    const a = post(origin, { ...request(), executionId: "in-flight" });
    await until(() => calls === 1, "first execution");
    const b = post(origin, { executionId: "in-flight", ...request() });
    const c = post(origin, { ...request(), jobId: "feed-agenda", executionId: "in-flight" });
    release();
    assert.deepEqual((await Promise.all([a, b, c])).map((r) => r.status), [200, 200, 409]);
    assert.equal(calls, 1);
  } finally { release(); await close(server); }
});
test("expired cache entries never rerun and full cache refuses admission", async () => {
  let calls = 0;
  const { server } = createExecutionServer({ resultTtlMs: 10, maxEntries: 1, execute: async (r) => { calls++; return { ok: true, executionId: r.executionId }; } });
  const { origin } = await listenExecutionServer(server);
  try {
    const body = { ...request(), executionId: "ttl" };
    assert.equal((await post(origin, body)).status, 200);
    await new Promise((r) => setTimeout(r, 25));
    assert.equal((await post(origin, body)).status, 410);
    assert.equal((await fetch(origin + "/results/ttl")).status, 410);
    assert.equal((await post(origin, { ...request(), executionId: "new" })).status, 503);
    assert.equal(calls, 1);
  } finally { await close(server); }
});
test("an execution exception is retained instead of rerunning the same key", async () => {
  let calls = 0;
  const { server } = createExecutionServer({ execute: async () => { calls++; throw Error("interrupted"); } });
  const { origin } = await listenExecutionServer(server);
  try { const body = { ...request(), executionId: "failure" }; assert.equal((await post(origin, body)).status, 500); assert.equal((await post(origin, body)).status, 500); assert.equal(calls, 1); }
  finally { await close(server); }
});
let execution;
async function actual() { if (!execution) execution = await runPaidOffer(request()); assert.equal(execution.ok, true, JSON.stringify(execution)); return structuredClone(execution); }
for (const [name, change] of [
  ["wrong nested job", (r) => { r.receipt.jobId = "feed-agenda"; }],
  ["nested incomplete", (r) => { r.receipt.delivery.complete = false; }],
  ["nested failed transport", (r) => { r.receipt.transport = "timeout"; }],
  ["nested output digest", (r) => { r.receipt.outputs[0].sha256 = "0".repeat(64); }],
  ["missing outer digest", (r) => { delete r.outputs[0].sha256; }],
  ["wrong outer job", (r) => { r.jobId = "feed-agenda"; r.receipt.jobId = "feed-agenda"; }],
]) test("mailbox rejects " + name + " on real execution bytes", async () => {
  const r = await actual(); change(r);
  assert.throws(() => seedFromD01Execution({ mailbox: join(root, name.replaceAll(" ", "-")), requestId: "delivery", execution: r, clock, expiresAt }));
});
test("atomicity verifier rejects a complete-byte receipt declaring timeout", async () => {
  const r = await actual(), file = join(r.runOutDir, "receipt.json"), original = readFileSync(file);
  try { const receipt = JSON.parse(original); receipt.transport = "timeout"; writeFileSync(file, JSON.stringify(receipt)); assert.equal(verifyComplete({ root: r.runOutDir }).ok, false); }
  finally { writeFileSync(file, original); }
});
function delivery(tag) {
  const files = ["budget-impact.json", "budget-impact.md"].map((name) => { const buf = Buffer.from(tag + name); return { name, buf, bytes: buf.length, sha256: createHash("sha256").update(buf).digest("hex") }; });
  return { files, envelope: buildEnvelope({ requestId: "same-slot", jobId: "vendor-budget-impact", completedAt: clock, expiresAt, artifacts: files }) };
}
test("mailbox key binds TTL, sample and engine identity, not only output bytes", () => {
  for (const field of ["expiresAt", "sample", "engine"]) {
    const mailbox = join(root, "identity-" + field), d = delivery("same");
    writeEnvelopeFiles({ mailbox, ...d });
    const changed = structuredClone(d);
    changed.envelope[field] = field === "expiresAt" ? "2026-09-12T08:20:00Z" : field === "sample" ? true : { archiveSha256: "0".repeat(64), archiveBytes: 1 };
    assert.throws(() => writeEnvelopeFiles({ mailbox, ...changed }), (e) => e.code === "request-id-conflict");
  }
});
const worker = join(repo, "server/paid-useful-jobs/test/fixtures/cw26-seed-worker.mjs");
test("two real seed processes cannot publish mixed artifact generations", async () => {
  const mailbox = join(root, "concurrent-mailbox"), barrier = join(root, "barrier");
  const a = tracked(worker, [mailbox, "AAAA", barrier]);
  await until(() => existsSync(barrier + ".paused"), "seed A pause");
  const b = tracked(worker, [mailbox, "BBBB"]);
  await until(() => ended(b), "seed B finish");
  writeFileSync(barrier + ".resume", "yes"); await until(() => ended(a), "seed A finish");
  assert.equal([a, b].filter((p) => JSON.parse(p.stdoutText.trim()).ok).length, 1);
  const result = pickup({ mailbox, requestId: "same-slot", outDir: join(root, "picked"), clock });
  assert.equal(result.ok, true, JSON.stringify(result));
});
test("SIGKILL mid-publication leaves no readable partial slot; a fresh process can retry", async () => {
  const mailbox = join(root, "killed-mailbox"), barrier = join(root, "kill-barrier");
  const a = tracked(worker, [mailbox, "AAAA", barrier]);
  await until(() => existsSync(barrier + ".paused"), "seed pause");
  a.kill("SIGKILL"); await until(() => ended(a), "seed kill");
  assert.throws(() => readEnvelope(mailbox, "same-slot"));
  const b = tracked(worker, [mailbox, "BBBB"]); await until(() => ended(b), "fresh seed");
  assert.equal(JSON.parse(b.stdoutText.trim()).ok, true, b.stdoutText);
  assert.equal(pickup({ mailbox, requestId: "same-slot", outDir: join(root, "recovered"), clock }).ok, true);
});
