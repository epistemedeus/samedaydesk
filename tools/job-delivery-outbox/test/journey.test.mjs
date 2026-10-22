import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { hashTerms, deliveryTermsFromReceipt } from "../lib/hash-terms.mjs";
import { engineArchiveIdentity } from "../lib/pins.mjs";
import { redactResultReferences } from "../lib/redact.mjs";
import {
  completedCallerReceipt,
  parseCli,
  runCli,
  spawnReceiver,
  stopChild,
  tmpSpace,
  writeJson,
} from "./helpers.mjs";

test("journey: two processes enqueue, deliver, ack, restart, one acknowledged event", { timeout: 60_000 }, async () => {
  const dir = tmpSpace("outbox-journey-");
  const store = join(dir, "store");
  const outDir = join(dir, "job-out");
  const recvDir = join(dir, "receiver");
  mkdirSync(store, { recursive: true });
  const receipt = completedCallerReceipt(outDir);
  const receiptPath = join(dir, "receipt.json");
  writeJson(receiptPath, receipt);
  assert.equal(receipt.schema, "samedaydesk.paid-useful-jobs.receipt.v1");
  assert.equal(receipt.sold, false);
  assert.equal(receipt.sample, false);
  assert.equal(receipt.purchaseAuthority, false);

  const receiver = await spawnReceiver(["--mode", "ack", "--store-dir", recvDir]);
  try {
    const enq = parseCli(
      runCli([
        "enqueue",
        "--store",
        store,
        "--receipt",
        receiptPath,
        "--callback-url",
        receiver.url,
      ]),
    );
    assert.equal(enq.ok, true, JSON.stringify(enq));
    assert.equal(enq.network, false);
    assert.equal(enq.duplicate, false);
    assert.equal(enq.event.deliveryState, "queued");
    assert.equal(enq.event.sold, false);
    assert.equal(enq.event.payload.sample, false);
    assert.ok(!JSON.stringify(enq.event.payload).includes("desk-chat-input"));
    assert.ok(!("inputs" in enq.event.payload));
    const eventId = enq.event.eventId;

    const deliver = parseCli(
      runCli(["deliver-once", "--store", store, "--event-id", eventId, "--opt-in"]),
    );
    assert.equal(deliver.ok, true, JSON.stringify(deliver));
    assert.equal(deliver.event.deliveryState, "delivered");
    assert.equal(deliver.event.callbackAcknowledged, true);
    assert.equal(deliver.event.buyerAccepted, false);
    assert.equal(deliver.event.sale, false);
    assert.equal(deliver.event.sold, false);
    assert.equal(deliver.event.sample, false);

    const restarted = parseCli(runCli(["status", "--store", store, "--event-id", eventId]));
    assert.equal(restarted.event.eventId, eventId);
    assert.equal(restarted.event.deliveryState, "delivered");
    assert.equal(restarted.event.callbackAcknowledged, true);
    assert.equal(restarted.event.buyerAccepted, false);
    assert.equal(restarted.event.sale, false);

    const all = parseCli(runCli(["status", "--store", store]));
    assert.equal(all.count, 1);
    assert.equal(all.events[0].deliveryState, "delivered");
  } finally {
    stopChild(receiver.child);
  }
});

test("hash terms: I01 stable stringify; archive identity is sha+bytes not version", () => {
  const receipt = {
    jobId: "vendor-budget-impact",
    fundingState: "reserved-fixture",
    sample: false,
    outputsDigest: "a".repeat(64),
    engine: {
      version: "1.0.0",
      archiveSha256: "6bf650391fad4fa658a7959e9717fc5499faf4caffa0a39f67c6c2ee033bdb51",
      archiveBytes: 2522418,
    },
  };
  const a = deliveryTermsFromReceipt(receipt, "http://127.0.0.1:9");
  const b = deliveryTermsFromReceipt(
    { ...receipt, engine: { ...receipt.engine, version: "9.9.9" } },
    "http://127.0.0.1:9",
  );
  assert.equal(hashTerms(a), hashTerms(b));
  assert.equal(
    engineArchiveIdentity(receipt.engine),
    engineArchiveIdentity({ ...receipt.engine, version: "9.9.9" }),
  );
  assert.notEqual(
    engineArchiveIdentity(receipt.engine),
    engineArchiveIdentity({ ...receipt.engine, archiveSha256: "0".repeat(64) }),
  );
  const flipped = hashTerms({
    schema: a.schema,
    callbackOrigin: a.callbackOrigin,
    engineArchiveIdentity: a.engineArchiveIdentity,
    fundingState: a.fundingState,
    jobId: a.jobId,
    liveSettlement: a.liveSettlement,
    outputsDigest: a.outputsDigest,
    purchaseAuthority: a.purchaseAuthority,
    sample: a.sample,
    sold: a.sold,
    termsVersion: a.termsVersion,
  });
  assert.equal(hashTerms(a), flipped);
});

test("redaction drops input contents and secret-looking keys", () => {
  const payload = redactResultReferences({
    eventId: "evt_test",
    receipt: {
      jobId: "vendor-budget-impact",
      fundingState: "unfunded",
      sample: false,
      outputsDigest: "b".repeat(64),
      outputs: [{ name: "budget-impact.json", bytes: 3, sha256: "c".repeat(64) }],
      engine: {},
      authorization: "Bearer secret",
      inputs: [{ name: "before", bytes: 1, sha256: "d".repeat(64) }],
    },
    termsHash: "e".repeat(64),
    termsVersion: 1,
    callbackOrigin: "http://127.0.0.1:1",
  });
  assert.equal(payload.sold, false);
  assert.equal(payload.buyerAccepted, false);
  assert.equal(payload.sale, false);
  assert.ok(!("inputs" in payload));
  assert.ok(!("authorization" in payload));
  assert.deepEqual(payload.outputs[0].name, "budget-impact.json");
});
