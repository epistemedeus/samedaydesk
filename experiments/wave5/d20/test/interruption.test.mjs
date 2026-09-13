import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { MAILBOX_PIN_SHA, OUTPUT_JSON, OUTPUT_MD, OUTBOX_PIN_SHA } from "../lib/pins.mjs";
import { assertNotSale, mailboxPickupOutcome, outboxEventOutcome, OUTCOME } from "../lib/outcomes.mjs";
import { commitThenLose, parseJsonStdout } from "../lib/spawn.mjs";
import {
  completeF08Job,
  envelopePath,
  mailbox,
  outbox,
  pickupMailbox,
  readEnvelope,
  runOutbox,
  seedMailbox,
  sha256File,
  spawnReceiver,
  stopChild,
  tmp,
} from "./helpers.mjs";

describe("W5-D20 interruption across mailbox and outbox CLIs", { timeout: 180_000 }, () => {
  it("mailbox: commit envelope then lose stdout; pickup in a new process retrieves the same bytes", () => {
    const job = completeF08Job(tmp("w5d20-f08-mail-"));
    const mailboxDir = tmp("w5d20-mail-");
    const requestId = "req-lost-seed-1";
    const lost = commitThenLose({
      bin: mailbox().cli,
      args: [
        "seed",
        "--mailbox",
        mailboxDir,
        "--request-id",
        requestId,
        "--job-id",
        job.body.jobId,
        "--from-out-dir",
        job.outDir,
        "--clock",
        "2026-09-11T20:00:00Z",
        "--expires-at",
        "2026-09-12T20:00:00Z",
      ],
      cwd: mailbox().root,
      commitPath: envelopePath(mailboxDir, requestId),
    });
    assert.equal(lost.stdoutLost, true);
    const envelope = readEnvelope(mailboxDir, requestId);
    assert.equal(envelope.schema, "samedaydesk.result-mailbox.envelope.v1");
    assert.equal(envelope.requestId, requestId);
    assert.equal(envelope.deliveredToBuyer, false);
    assert.equal(envelope.sold, false);

    const pickupOut = tmp("w5d20-pickup-");
    const pickupProc = pickupMailbox([
      "--mailbox",
      mailboxDir,
      "--request-id",
      requestId,
      "--out",
      pickupOut,
    ]);
    assert.equal(pickupProc.status, 0, pickupProc.stderr + pickupProc.stdout);
    const pickup = parseJsonStdout(pickupProc);
    const outcome = mailboxPickupOutcome(pickup);
    assert.equal(outcome.class, OUTCOME.RETRIEVED);
    assert.equal(outcome.retrieved, true);
    assert.equal(outcome.callbackAck, false);
    assert.equal(outcome.usefulDelivery, false);
    assertNotSale(assert, pickup);
    assert.equal(pickup.requestId, requestId);
    assert.equal(sha256File(join(pickupOut, OUTPUT_JSON)), sha256File(join(job.outDir, OUTPUT_JSON)));
    assert.equal(sha256File(join(pickupOut, OUTPUT_MD)), sha256File(join(job.outDir, OUTPUT_MD)));
    const envelopeAfter = readEnvelope(mailboxDir, requestId);
    assert.equal(envelopeAfter.deliveredToBuyer, false);
    if (mailbox().sha === MAILBOX_PIN_SHA) {
      assert.equal(pickup.deliveredToBuyer, true);
    }
    assert.equal(pickup.status, "retrieved");
    assert.notEqual(pickup.status, "delivered");
  });

  it("outbox: commit enqueue then lose stdout; status in a new process stays queued", () => {
    const job = completeF08Job(tmp("w5d20-f08-enq-"));
    const store = tmp("w5d20-store-enq-");
    const commitPath = join(store, "outbox.json");
    const lost = commitThenLose({
      bin: outbox().cli,
      args: [
        "enqueue",
        "--store",
        store,
        "--receipt",
        job.receiptPath,
        "--callback-url",
        "http://127.0.0.1:9/callback",
        "--event-id",
        "evt_lost_enqueue",
      ],
      cwd: outbox().root,
      commitPath,
      commitMatch: (text) => text.includes("evt_lost_enqueue"),
    });
    assert.equal(lost.stdoutLost, true);
    const statusProc = runOutbox(["status", "--store", store, "--event-id", "evt_lost_enqueue"]);
    assert.equal(statusProc.status, 0, statusProc.stderr + statusProc.stdout);
    const status = parseJsonStdout(statusProc);
    const outcome = outboxEventOutcome(status.event);
    assert.equal(outcome.class, OUTCOME.QUEUED);
    assert.equal(status.event.eventId, "evt_lost_enqueue");
    assert.equal(status.event.callbackAcknowledged, false);
    assertNotSale(assert, status.event);
  });

  it("outbox: SIGTERM after attempt persist and before HTTP response leaves unknown, not delivered", async () => {
    const job = completeF08Job(tmp("w5d20-f08-sig-"));
    const store = tmp("w5d20-store-sig-");
    const ready = join(tmp("w5d20-ready-"), "attempt-ready.json");
    const receiver = await spawnReceiver(["--mode", "ack", "--delay-ms", "20000"]);
    try {
      const enq = parseJsonStdout(
        runOutbox([
          "enqueue",
          "--store",
          store,
          "--receipt",
          job.receiptPath,
          "--callback-url",
          receiver.url,
          "--event-id",
          "evt_sigterm",
        ]),
      );
      assert.equal(enq.event.deliveryState, "queued");
      const lost = commitThenLose({
        bin: outbox().cli,
        args: [
          "deliver-once",
          "--store",
          store,
          "--event-id",
          enq.event.eventId,
          "--opt-in",
          "--attempt-ready",
          ready,
          "--timeout-ms",
          "25000",
        ],
        cwd: outbox().root,
        commitPath: ready,
        timeoutMs: 20_000,
      });
      assert.equal(lost.stdoutLost, true);
      const status = parseJsonStdout(runOutbox(["status", "--store", store, "--event-id", "evt_sigterm"]));
      const outcome = outboxEventOutcome(status.event);
      assert.equal(outcome.class, OUTCOME.TRANSPORT_UNKNOWN);
      assert.equal(outcome.callbackAck, false);
      assert.equal(status.event.eventId, "evt_sigterm");
      assert.equal(status.event.deliveryState, "unknown");
      assert.equal(status.event.termsHash, enq.event.termsHash);
      assert.ok((status.event.attempts || []).length >= 1);
      assert.equal(status.event.attempts[0].outcome, "unknown");
      const replay = runOutbox(["deliver-once", "--store", store, "--event-id", "evt_sigterm", "--opt-in"]);
      assert.equal(replay.status, 2);
      const refused = parseJsonStdout(replay);
      assert.equal(refused.code, "unknown-outcome-no-auto-replay");
      assertNotSale(assert, status.event);
    } finally {
      stopChild(receiver.child);
    }
  });

  it("cross: mailbox retrieval is not outbox callback ack, and ack is not a sale", async () => {
    const job = completeF08Job(tmp("w5d20-f08-cross-"));
    const mailboxDir = tmp("w5d20-mail-cross-");
    const requestId = "req-cross-1";
    const seed = seedMailbox([
      "--mailbox",
      mailboxDir,
      "--request-id",
      requestId,
      "--job-id",
      "vendor-budget-impact",
      "--from-out-dir",
      job.outDir,
    ]);
    assert.equal(seed.status, 0, seed.stderr + seed.stdout);
    const pickupOut = tmp("w5d20-pick-cross-");
    const pickup = parseJsonStdout(
      pickupMailbox(["--mailbox", mailboxDir, "--request-id", requestId, "--out", pickupOut]),
    );
    const retrieved = mailboxPickupOutcome(pickup);
    assert.equal(retrieved.class, OUTCOME.RETRIEVED);

    const store = tmp("w5d20-store-cross-");
    const receiver = await spawnReceiver(["--mode", "ack"]);
    try {
      const enq = parseJsonStdout(
        runOutbox([
          "enqueue",
          "--store",
          store,
          "--receipt",
          job.receiptPath,
          "--callback-url",
          receiver.url,
        ]),
      );
      assert.equal(outboxEventOutcome(enq.event).class, OUTCOME.QUEUED);
      assert.equal(retrieved.callbackAck, false);
      assert.notEqual(enq.event.deliveryState, "delivered");

      const deliver = parseJsonStdout(
        runOutbox(["deliver-once", "--store", store, "--event-id", enq.event.eventId, "--opt-in"]),
      );
      const acked = outboxEventOutcome(deliver.event);
      assert.equal(acked.class, OUTCOME.CALLBACK_ACKED);
      assert.equal(acked.sold, false);
      assert.equal(acked.buyerAccepted, false);
      assert.equal(deliver.event.sample, false);

      const restarted = parseJsonStdout(
        runOutbox(["status", "--store", store, "--event-id", enq.event.eventId]),
      );
      assert.equal(restarted.event.deliveryState, "delivered");
      assert.equal(restarted.event.callbackAcknowledged, true);
      assert.equal(readEnvelope(mailboxDir, requestId).deliveredToBuyer, false);
      assert.notEqual(pickup.termsVersion, enq.event.termsHash);
      assert.match(String(pickup.termsVersion), /^sha256:[0-9a-f]{64}$/);
      assert.match(String(enq.event.termsHash), /^[0-9a-f]{64}$/);
      if (outbox().sha === OUTBOX_PIN_SHA) {
        assert.equal(enq.event.termsVersion, 1);
      }
    } finally {
      stopChild(receiver.child);
    }
  });

  it("SAMPLE mailbox --delivered is analysis refusal; socket-close is transport unknown", async () => {
    const mailboxDir = tmp("w5d20-sample-mail-");
    const engineOut = tmp("w5d20-sample-engine-");
    const requestId = "req-sample-1";
    const seed = seedMailbox([
      "--mailbox",
      mailboxDir,
      "--request-id",
      requestId,
      "--job-id",
      "vendor-budget-impact",
      "--example",
      "--out-dir",
      engineOut,
    ]);
    assert.equal(seed.status, 0, seed.stderr + seed.stdout);
    const pickup = parseJsonStdout(
      pickupMailbox([
        "--mailbox",
        mailboxDir,
        "--request-id",
        requestId,
        "--out",
        tmp("w5d20-sample-out-"),
        "--delivered",
      ]),
    );
    const refusal = mailboxPickupOutcome(pickup);
    assert.equal(refusal.class, OUTCOME.ANALYSIS_REFUSAL);
    assert.equal(pickup.code, "sample-not-delivered");
    assert.equal(pickup.deliveredToBuyer, false);

    const job = completeF08Job(tmp("w5d20-f08-close-"));
    const store = tmp("w5d20-store-close-");
    const recvDir = tmp("w5d20-recv-close-");
    const receiver = await spawnReceiver(["--mode", "close-after-store", "--store-dir", recvDir]);
    try {
      const enq = parseJsonStdout(
        runOutbox([
          "enqueue",
          "--store",
          store,
          "--receipt",
          job.receiptPath,
          "--callback-url",
          receiver.url,
        ]),
      );
      const deliver = parseJsonStdout(
        runOutbox(["deliver-once", "--store", store, "--event-id", enq.event.eventId, "--opt-in"]),
      );
      const unknown = outboxEventOutcome(deliver.event);
      assert.equal(unknown.class, OUTCOME.TRANSPORT_UNKNOWN);
      assert.notEqual(unknown.class, OUTCOME.ANALYSIS_REFUSAL);
      assert.equal(deliver.event.deliveryState, "unknown");
      const stored = readdirSync(recvDir).filter((name) => name.endsWith(".json"));
      assert.equal(stored.length >= 1, true);
    } finally {
      stopChild(receiver.child);
    }
  });
});
