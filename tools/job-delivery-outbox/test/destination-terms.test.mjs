import assert from "node:assert/strict";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { digestNamedBytes } from "../lib/receipt-shape.mjs";
import { OUTBOX_CONTRACT } from "../lib/contract.mjs";
import {
  completedCallerReceipt,
  parseCli,
  runCli,
  spawnReceiver,
  stopChild,
  tmpSpace,
  writeJson,
  sds52Worktree,
} from "./helpers.mjs";

test("CLI: same-origin different callback paths are distinct destinations", { timeout: 60_000 }, async () => {
  const dir = tmpSpace("outbox-paths-");
  const store = join(dir, "store");
  const receipt = completedCallerReceipt(join(dir, "out"));
  const receiptPath = join(dir, "receipt.json");
  writeJson(receiptPath, receipt);
  const a = parseCli(
    runCli(["enqueue", "--store", store, "--receipt", receiptPath, "--callback-url", "http://127.0.0.1:9/callback-a"]),
  );
  const b = parseCli(
    runCli(["enqueue", "--store", store, "--receipt", receiptPath, "--callback-url", "http://127.0.0.1:9/callback-b"]),
  );
  assert.equal(a.ok, true, JSON.stringify(a));
  assert.equal(b.ok, true, JSON.stringify(b));
  assert.notEqual(a.event.eventId, b.event.eventId);
  assert.notEqual(a.event.termsHash, b.event.termsHash);
  assert.equal(a.event.callbackDestination.path, "/callback-a");
  assert.equal(b.event.callbackDestination.path, "/callback-b");
  assert.equal(a.event.callbackDestination.origin, b.event.callbackDestination.origin);
  assert.equal(a.event.mappingId, OUTBOX_CONTRACT.termsMapping.id);
});

test("CLI: asserted outputsDigest that disagrees with listed outputs is refused", { timeout: 30_000 }, () => {
  const dir = tmpSpace("outbox-digest-");
  const store = join(dir, "store");
  const receipt = completedCallerReceipt(join(dir, "out"));
  receipt.outputsDigest = "f".repeat(64);
  const receiptPath = join(dir, "receipt.json");
  writeJson(receiptPath, receipt);
  const result = runCli([
    "enqueue",
    "--store",
    store,
    "--receipt",
    receiptPath,
    "--callback-url",
    "http://127.0.0.1:9/callback",
  ]);
  assert.equal(result.status, 2);
  const body = parseCli(result);
  assert.equal(body.code, "outputs-digest-mismatch");
  assert.equal(body.sold, false);
});

test("CLI: missing engine archive identity is refused; kit pin is not invented", { timeout: 30_000 }, () => {
  const dir = tmpSpace("outbox-pin-");
  const store = join(dir, "store");
  const receipt = completedCallerReceipt(join(dir, "out"));
  delete receipt.engine.archiveSha256;
  delete receipt.engine.archiveBytes;
  const receiptPath = join(dir, "receipt.json");
  writeJson(receiptPath, receipt);
  const result = runCli([
    "enqueue",
    "--store",
    store,
    "--receipt",
    receiptPath,
    "--callback-url",
    "http://127.0.0.1:9/callback",
  ]);
  assert.equal(result.status, 2);
  assert.equal(parseCli(result).code, "engine-archive-identity");
});

test("two-process: wrong callback path in ack is not delivered", { timeout: 60_000 }, async () => {
  const dir = tmpSpace("outbox-wrong-path-");
  const store = join(dir, "store");
  const receipt = completedCallerReceipt(join(dir, "out"));
  const receiptPath = join(dir, "receipt.json");
  writeJson(receiptPath, receipt);
  const receiver = await spawnReceiver(["--mode", "ack-wrong-path"]);
  try {
    const enq = parseCli(
      runCli(["enqueue", "--store", store, "--receipt", receiptPath, "--callback-url", receiver.url]),
    );
    const deliver = parseCli(
      runCli(["deliver-once", "--store", store, "--event-id", enq.event.eventId, "--opt-in"]),
    );
    assert.equal(deliver.ok, true, JSON.stringify(deliver));
    assert.equal(deliver.event.deliveryState, "failed");
    assert.notEqual(deliver.event.deliveryState, "delivered");
    assert.equal(deliver.event.callbackAcknowledged, false);
    assert.equal(deliver.event.attempts[0].error, "ack-destination-mismatch");
  } finally {
    stopChild(receiver.child);
  }
});

test("two-process: wrong outputsDigest in ack is not delivered", { timeout: 60_000 }, async () => {
  const dir = tmpSpace("outbox-wrong-digest-");
  const store = join(dir, "store");
  const receipt = completedCallerReceipt(join(dir, "out"));
  const receiptPath = join(dir, "receipt.json");
  writeJson(receiptPath, receipt);
  const receiver = await spawnReceiver(["--mode", "ack-wrong-digest"]);
  try {
    const enq = parseCli(
      runCli(["enqueue", "--store", store, "--receipt", receiptPath, "--callback-url", receiver.url]),
    );
    const deliver = parseCli(
      runCli(["deliver-once", "--store", store, "--event-id", enq.event.eventId, "--opt-in"]),
    );
    assert.equal(deliver.event.deliveryState, "failed");
    assert.equal(deliver.event.callbackAcknowledged, false);
    assert.equal(deliver.event.attempts[0].error, "ack-digest-mismatch");
  } finally {
    stopChild(receiver.child);
  }
});

test("two-process: event-only ack without path/digest is not delivered", { timeout: 60_000 }, async () => {
  const dir = tmpSpace("outbox-event-only-");
  const store = join(dir, "store");
  const receipt = completedCallerReceipt(join(dir, "out"));
  const receiptPath = join(dir, "receipt.json");
  writeJson(receiptPath, receipt);
  const receiver = await spawnReceiver(["--mode", "ack-event-only"]);
  try {
    const enq = parseCli(
      runCli(["enqueue", "--store", store, "--receipt", receiptPath, "--callback-url", receiver.url]),
    );
    const deliver = parseCli(
      runCli(["deliver-once", "--store", store, "--event-id", enq.event.eventId, "--opt-in"]),
    );
    assert.equal(deliver.event.deliveryState, "failed");
    assert.equal(deliver.event.callbackAcknowledged, false);
  } finally {
    stopChild(receiver.child);
  }
});

test("two-process: empty HTTP 200 ack body is not completion; reconcile does not invent delivered", { timeout: 60_000 }, async () => {
  const dir = tmpSpace("outbox-empty-ack-");
  const store = join(dir, "store");
  const receipt = completedCallerReceipt(join(dir, "out"));
  const receiptPath = join(dir, "receipt.json");
  writeJson(receiptPath, receipt);
  const receiver = await spawnReceiver(["--mode", "empty-body"]);
  try {
    const enq = parseCli(
      runCli(["enqueue", "--store", store, "--receipt", receiptPath, "--callback-url", receiver.url]),
    );
    const deliver = parseCli(
      runCli(["deliver-once", "--store", store, "--event-id", enq.event.eventId, "--opt-in"]),
    );
    assert.notEqual(deliver.event.deliveryState, "delivered");
    assert.equal(deliver.event.deliveryState, "failed");
    assert.equal(deliver.event.callbackAcknowledged, false);
    const rec = parseCli(runCli(["reconcile", "--store", store]));
    assert.equal(rec.counts.delivered, 0);
    assert.equal(rec.autoReplay, false);
  } finally {
    stopChild(receiver.child);
  }
});

test("listed-output digest matches SDS52 receipt.v1 algorithm", async () => {
  const worktree = sds52Worktree();
  const pinDigest = await import(pathToFileURL(join(worktree, "server/paid-useful-jobs/lib/digest.mjs")).href);
  const outputs = [
    { name: "budget-impact.json", bytes: 12, sha256: "ab".repeat(32) },
    { name: "budget-impact.md", bytes: 7, sha256: "cd".repeat(32) },
  ];
  assert.equal(digestNamedBytes(outputs), pinDigest.digestNamedBytes(outputs));
});
