import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { runPaidOffer } from "../../../server/paid-useful-jobs/lib/wrapper.mjs";
import { createExecutionServer, listenExecutionServer } from "../../../server/paid-useful-jobs/lib/http.mjs";
import { runCreateOrder } from "../lib/create-order.mjs";
import { createFileStore } from "../lib/store-file.mjs";
import { loadOrder, ORDERS } from "./helpers.mjs";

const root = mkdtempSync(join(tmpdir(), "cw26-order-"));
after(() => rmSync(root, { recursive: true, force: true }));
let sequence = 0;
function fixture() {
  const dir = join(root, String(sequence++)); mkdirSync(dir);
  const raw = loadOrder("ord-1.json"); raw.orderId = "cw26-" + sequence;
  raw.inputs = raw.inputs.map((i) => {
    const path = join(dir, i.flag.slice(2) + ".txt");
    writeFileSync(path, readFileSync(resolve(ORDERS, i.path)));
    return { ...i, path };
  });
  return { raw, store: createFileStore(join(dir, "store")), outDir: join(dir, "out") };
}
const contract = "samedaydesk.paid-useful-jobs.execution.v1";
test("managed order rejects unbound fileBytes overrides before executing", async () => {
  const f = fixture(); let calls = 0;
  f.raw.fileBytes = { before: Buffer.from("different verified content") };
  const r = await runCreateOrder(f.raw, { ...f, wrapper: { version: contract, runPaidOffer: async () => { calls++; return { ok: true }; } } });
  assert.equal(r.ok, false); assert.equal(r.code, "f-input"); assert.equal(calls, 0);
});
for (const http of [false, true]) test("verified bytes survive post-reservation file replacement: " + (http ? "HTTP" : "library"), async () => {
  const f = fixture(), before = f.raw.inputs.find((r) => r.flag === "--before");
  const record = f.store.recordExecution.bind(f.store);
  f.store.recordExecution = async (r) => { await record(r); writeFileSync(before.path, "not the verified OpenAPI document"); };
  let server;
  try {
    let executeUrl;
    if (http) { ({ server } = createExecutionServer()); ({ origin: executeUrl } = await listenExecutionServer(server)); }
    const r = await runCreateOrder(f.raw, { ...f, executeUrl });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.wrapper.receipt.inputs.find((i) => i.name === "before").sha256, before.sha256);
  } finally { if (server) { server.closeAllConnections(); await new Promise((r) => server.close(r)); } }
});
for (const [name, mutate] of [
  ["wrong job", (r) => { r.jobId = "feed-agenda"; }],
  ["wrong execution", (r) => { r.executionId = "not-this-order"; }],
  ["wrong contract", (r) => { r.contract = "foreign.v1"; }],
  ["failed transport", (r) => { r.transport = "timeout"; }],
  ["incomplete delivery", (r) => { r.delivery.complete = false; }],
  ["wrong nested job", (r) => { r.receipt.jobId = "feed-agenda"; }],
  ["incomplete nested delivery", (r) => { r.receipt.delivery.complete = false; }],
  ["wrong engine pin", (r) => { r.receipt.engine.archiveSha256 = "0".repeat(64); }],
  ["missing output digest", (r) => { delete r.outputs[0].sha256; }],
  ["contradictory nested digest", (r) => { r.receipt.outputs[0].sha256 = "0".repeat(64); }],
]) test("managed order refuses and durably replays " + name, async () => {
  const f = fixture(); let calls = 0;
  const wrapper = { version: contract, kind: "library", runPaidOffer: async (request) => {
    calls++; const r = await runPaidOffer(request); assert.equal(r.ok, true, JSON.stringify(r)); mutate(r); return r;
  } };
  const r = await runCreateOrder(f.raw, { ...f, wrapper });
  assert.equal(r.ok, false, JSON.stringify(r)); assert.equal(r.code, "invalid-execution-result");
  const replay = await runCreateOrder(f.raw, { ...f, wrapper });
  assert.equal(replay.ok, false); assert.equal(replay.replayed, true); assert.equal(calls, 1);
});
