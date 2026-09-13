import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { join } from "node:path";
import test from "node:test";
import { cli, parseCli, runCli, sampleReceipt, spawnReceiver, stopChild, tmpSpace, waitForFile, writeJson } from "./helpers.mjs";
import { completedCallerReceipt } from "./helpers.mjs";
import { REPO_ROOT } from "../lib/pins.mjs";
import { digestNamedBytes } from "../lib/receipt-shape.mjs";

test("seeded: receiver stores then closes before response -> unknown, not failed or delivered", { timeout: 60_000 }, async () => {
  const dir = tmpSpace("outbox-close-");
  const store = join(dir, "store");
  const recvDir = join(dir, "recv");
  const receipt = completedCallerReceipt(join(dir, "out"));
  const receiptPath = join(dir, "receipt.json");
  writeJson(receiptPath, receipt);
  const receiver = await spawnReceiver(["--mode", "close-after-store", "--store-dir", recvDir]);
  try {
    const enq = parseCli(
      runCli(["enqueue", "--store", store, "--receipt", receiptPath, "--callback-url", receiver.url]),
    );
    const deliver = parseCli(
      runCli(["deliver-once", "--store", store, "--event-id", enq.event.eventId, "--opt-in"]),
    );
    assert.equal(deliver.ok, true, JSON.stringify(deliver));
    assert.equal(deliver.event.deliveryState, "unknown");
    assert.notEqual(deliver.event.deliveryState, "failed");
    assert.notEqual(deliver.event.deliveryState, "delivered");
    assert.equal(deliver.event.callbackAcknowledged, false);
    const replay = runCli(["deliver-once", "--store", store, "--event-id", enq.event.eventId, "--opt-in"]);
    assert.equal(replay.status, 2);
    const body = parseCli(replay);
    assert.equal(body.code, "unknown-outcome-no-auto-replay");
    const rec = parseCli(runCli(["reconcile", "--store", store]));
    assert.equal(rec.autoReplay, false);
    assert.equal(rec.network, false);
    assert.equal(rec.counts.unknown, 1);
  } finally {
    stopChild(receiver.child);
  }
});

test("seeded: SIGTERM between attempt record and HTTP response keeps event identity", { timeout: 60_000 }, async () => {
  const dir = tmpSpace("outbox-sigterm-");
  const store = join(dir, "store");
  const receipt = completedCallerReceipt(join(dir, "out"));
  const receiptPath = join(dir, "receipt.json");
  writeJson(receiptPath, receipt);
  const ready = join(dir, "attempt-ready.json");
  const receiver = await spawnReceiver(["--mode", "ack", "--delay-ms", "20000"]);
  try {
    const enq = parseCli(
      runCli(["enqueue", "--store", store, "--receipt", receiptPath, "--callback-url", receiver.url]),
    );
    const eventId = enq.event.eventId;
    const child = spawn(
      process.execPath,
      [cli, "deliver-once", "--store", store, "--event-id", eventId, "--opt-in", "--attempt-ready", ready, "--timeout-ms", "25000"],
      { cwd: REPO_ROOT, stdio: ["ignore", "pipe", "pipe"] },
    );
    waitForFile(ready, 8_000);
    child.kill("SIGTERM");
    await new Promise((resolve) => child.once("exit", resolve));
    const status = parseCli(runCli(["status", "--store", store, "--event-id", eventId]));
    assert.equal(status.event.eventId, eventId);
    assert.equal(status.event.deliveryState, "unknown");
    assert.equal(status.event.callbackAcknowledged, false);
    assert.equal(status.event.termsHash, enq.event.termsHash);
    assert.ok((status.event.attempts || []).length >= 1);
    assert.equal(status.event.attempts[0].outcome, "unknown");
  } finally {
    stopChild(receiver.child);
  }
});

test("seeded: duplicate enqueue is idempotent; body change under same event ID is rejected", { timeout: 60_000 }, async () => {
  const dir = tmpSpace("outbox-dup-");
  const store = join(dir, "store");
  const receipt = completedCallerReceipt(join(dir, "out"));
  const receiptPath = join(dir, "receipt.json");
  writeJson(receiptPath, receipt);
  const url = "http://127.0.0.1:9/callback";
  const first = parseCli(
    runCli(["enqueue", "--store", store, "--receipt", receiptPath, "--callback-url", url, "--event-id", "evt_fixed"]),
  );
  assert.equal(first.ok, true);
  assert.equal(first.duplicate, false);
  const second = parseCli(
    runCli(["enqueue", "--store", store, "--receipt", receiptPath, "--callback-url", url, "--event-id", "evt_fixed"]),
  );
  assert.equal(second.ok, true);
  assert.equal(second.duplicate, true);
  assert.equal(second.event.eventId, "evt_fixed");

  const changedOutputs = [
    { ...receipt.outputs[0], sha256: "a".repeat(64) },
    ...receipt.outputs.slice(1),
  ];
  const changed = {
    ...receipt,
    outputs: changedOutputs,
    outputsDigest: digestNamedBytes(changedOutputs),
  };
  const changedPath = join(dir, "changed.json");
  writeJson(changedPath, changed);
  const conflict = runCli([
    "enqueue",
    "--store",
    store,
    "--receipt",
    changedPath,
    "--callback-url",
    url,
    "--event-id",
    "evt_fixed",
  ]);
  assert.equal(conflict.status, 2);
  const body = parseCli(conflict);
  assert.equal(body.code, "event-id-body-conflict");
});

test("seeded: SAMPLE remains SAMPLE; callback ack is not buyer acceptance or a sale", { timeout: 60_000 }, async () => {
  const dir = tmpSpace("outbox-sample-");
  const store = join(dir, "store");
  const receipt = sampleReceipt(join(dir, "out"));
  assert.equal(receipt.sample, true);
  assert.equal(receipt.sold, false);
  const receiptPath = join(dir, "receipt.json");
  writeJson(receiptPath, receipt);
  const receiver = await spawnReceiver(["--mode", "ack"]);
  try {
    const enq = parseCli(
      runCli(["enqueue", "--store", store, "--receipt", receiptPath, "--callback-url", receiver.url]),
    );
    assert.equal(enq.event.sample, true);
    assert.equal(enq.event.payload.sample, true);
    const deliver = parseCli(
      runCli(["deliver-once", "--store", store, "--event-id", enq.event.eventId, "--opt-in"]),
    );
    assert.equal(deliver.event.deliveryState, "delivered");
    assert.equal(deliver.event.sample, true);
    assert.equal(deliver.event.payload.sample, true);
    assert.equal(deliver.event.sold, false);
    assert.equal(deliver.event.sale, false);
    assert.equal(deliver.event.buyerAccepted, false);
    assert.equal(deliver.event.callbackAcknowledged, true);
  } finally {
    stopChild(receiver.child);
  }
});

test("seeded: invented paid status is refused; non-loopback and missing opt-in refuse closed", { timeout: 30_000 }, async () => {
  const dir = tmpSpace("outbox-refuse-");
  const store = join(dir, "store");
  const receipt = completedCallerReceipt(join(dir, "out"));
  receipt.sold = true;
  const soldPath = join(dir, "sold.json");
  writeJson(soldPath, receipt);
  const sold = runCli([
    "enqueue",
    "--store",
    store,
    "--receipt",
    soldPath,
    "--callback-url",
    "http://127.0.0.1:9/callback",
  ]);
  assert.equal(sold.status, 2);
  assert.equal(parseCli(sold).code, "invented-paid-status");

  const honest = completedCallerReceipt(join(dir, "out2"));
  const honestPath = join(dir, "honest.json");
  writeJson(honestPath, honest);
  const remote = runCli([
    "enqueue",
    "--store",
    store,
    "--receipt",
    honestPath,
    "--callback-url",
    "http://example.com/hooks",
  ]);
  assert.equal(remote.status, 2);
  assert.equal(parseCli(remote).code, "callback-url-not-loopback");

  const queued = parseCli(
    runCli(["enqueue", "--store", store, "--receipt", honestPath, "--callback-url", "http://127.0.0.1:9/callback"]),
  );
  const noOpt = runCli(["deliver-once", "--store", store, "--event-id", queued.event.eventId]);
  assert.equal(noOpt.status, 2);
  assert.equal(parseCli(noOpt).code, "opt-in-required");
});
