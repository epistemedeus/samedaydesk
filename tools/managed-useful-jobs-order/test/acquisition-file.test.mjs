import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { AcquisitionRefuse } from "../lib/acquisition-errors.mjs";
import { createFileStore } from "../lib/store-file.mjs";
import { createAcquisitionService } from "../lib/acquisition.mjs";
import { MANAGED_ORDER_TERMS_SCHEMA } from "../lib/acquisition-constants.mjs";
import { hashTerms as orderHashTerms } from "../lib/digest.mjs";
import {
  PRINCIPAL_A,
  PRINCIPAL_B,
  SERVER_EXPIRED,
  SERVER_LATER,
  SERVER_NOW,
  admitAndPublish,
  availableResult,
  fileService,
  frozenHash,
  pairFor,
  snapshotSeamCalls,
  termsHash,
  unchanged,
} from "./acquisition-helpers.mjs";

describe("HA1 file-store durable retrieval", { timeout: 60_000 }, () => {
  it("publishes two promised outputs and retrieves them by principal+executionId+requestHash", async () => {
    const { service, reader, seams } = await fileService();
    const before = snapshotSeamCalls(seams);
    const { executionId, requestHash, pair, result } = await admitAndPublish(service);
    const got = await reader.get(
      { principalId: PRINCIPAL_A, executionId, requestHash },
      SERVER_LATER,
    );
    assert.equal(got.state, "available");
    assert.equal(got.purchaseAuthority, false);
    assert.equal(got.sold, false);
    assert.equal(got.jobId, "lockfile-pin-delta");
    assert.equal(got.outputsDigest, pair.outputsDigest);
    assert.equal(got.expiresAt, result.expiresAt);
    assert.equal(got.outputs.length, 2);
    const opened = await reader.openVerified(
      { principalId: PRINCIPAL_A, executionId, requestHash, name: "pin-delta.json", sha256: pair.outputs[0].sha256 },
      SERVER_LATER,
    );
    assert.equal(opened.metadata.bytes, pair.outputs[0].bytes);
    assert.equal(Buffer.from(opened.bytes).toString("utf8"), Buffer.from(pair.files[0].bytes).toString("utf8"));
    assert.ok(unchanged(before, seams.calls));
  });

  it("GET miss/pending/expired/restarted IDs does not invoke injected engine/payment/outbox spies", async () => {
    const { service, reader, dir, seams } = await fileService();
    const pendingId = "exec-pending-1";
    const requestHash = frozenHash("lockfile-pin-delta", "pending");
    await service.admit({
      principalId: PRINCIPAL_A,
      executionId: pendingId,
      requestHash,
      managedOrderTermsHash: termsHash("pending"),
      jobId: "lockfile-pin-delta",
      termsVersion: MANAGED_ORDER_TERMS_SCHEMA,
      createdAt: SERVER_NOW,
      serverNow: SERVER_NOW,
    });
    const published = await admitAndPublish(service, { executionId: "exec-live-1" });
    await service.expire(
      { principalId: PRINCIPAL_A, executionId: published.executionId, requestHash: published.requestHash },
      SERVER_LATER,
    );
    const before = snapshotSeamCalls(seams);
    const miss = await reader.get(
      { principalId: PRINCIPAL_A, executionId: "exec-missing", requestHash },
      SERVER_LATER,
    );
    const pending = await reader.get(
      { principalId: PRINCIPAL_A, executionId: pendingId, requestHash },
      SERVER_LATER,
    );
    const expired = await reader.get(
      { principalId: PRINCIPAL_A, executionId: published.executionId, requestHash: published.requestHash },
      SERVER_LATER,
    );
    assert.equal(miss.state, "not-found");
    assert.equal(pending.state, "pending");
    assert.equal(expired.state, "expired");
    const restarted = createAcquisitionService({
      store: createFileStore(dir),
      forbiddenSeams: seams.spies,
    });
    const afterRestart = await restarted.reader.get(
      { principalId: PRINCIPAL_A, executionId: pendingId, requestHash },
      SERVER_LATER,
    );
    assert.equal(afterRestart.state, "pending");
    assert.ok(unchanged(before, seams.calls));
    assert.equal(typeof reader.runCreateOrder, "undefined");
  });

  it("principal B and a second job identity learn no result or artifact metadata", async () => {
    const { service, reader } = await fileService();
    const { executionId, requestHash, pair } = await admitAndPublish(service);
    const other = await reader.get(
      { principalId: PRINCIPAL_B, executionId, requestHash },
      SERVER_LATER,
    );
    assert.equal(other.state, "not-found");
    assert.equal("outputs" in other, false);
    assert.equal("receiptSha256" in other, false);
    await assert.rejects(
      () =>
        reader.openVerified(
          {
            principalId: PRINCIPAL_B,
            executionId,
            requestHash,
            name: "pin-delta.json",
            sha256: pair.outputs[0].sha256,
          },
          SERVER_LATER,
        ),
      (err) => err instanceof AcquisitionRefuse && err.state === "not-found",
    );
  });

  it("same ID with changed frozen input, terms, principal, receipt or output tuple refuses after restart", async () => {
    const { service, dir } = await fileService();
    const first = await admitAndPublish(service, { executionId: "exec-identity-1" });
    await assert.rejects(
      () =>
        service.admit({
          principalId: PRINCIPAL_B,
          executionId: first.executionId,
          requestHash: first.requestHash,
          managedOrderTermsHash: first.result.receiptSha256,
          jobId: "lockfile-pin-delta",
          termsVersion: MANAGED_ORDER_TERMS_SCHEMA,
          createdAt: SERVER_NOW,
          serverNow: SERVER_NOW,
        }),
      (err) => err instanceof AcquisitionRefuse && err.state === "identity-conflict",
    );
    const otherHash = frozenHash("lockfile-pin-delta", "changed-input");
    const got = await service.reader.get(
      { principalId: PRINCIPAL_A, executionId: first.executionId, requestHash: otherHash },
      SERVER_LATER,
    );
    assert.equal(got.state, "identity-conflict");
    const otherPair = pairFor("lockfile-pin-delta", "mutated");
    await assert.rejects(
      () =>
        service.publishCompleted(
          availableResult({
            principalId: PRINCIPAL_A,
            executionId: first.executionId,
            requestHash: first.requestHash,
            pair: otherPair,
          }),
          otherPair.files,
        ),
      (err) => err instanceof AcquisitionRefuse && err.state === "identity-conflict",
    );
    const restarted = createAcquisitionService({ store: createFileStore(dir) });
    const again = await restarted.reader.get(
      { principalId: PRINCIPAL_A, executionId: first.executionId, requestHash: first.requestHash },
      SERVER_LATER,
    );
    assert.equal(again.state, "available");
    assert.equal(again.outputsDigest, first.pair.outputsDigest);
    const termsAsRequest = await restarted.reader.get(
      { principalId: PRINCIPAL_A, executionId: first.executionId, requestHash: termsHash(first.executionId) },
      SERVER_LATER,
    );
    assert.equal(termsAsRequest.state, "identity-conflict");
  });

  it("identical retry after commit returns identical and recovers the same record", async () => {
    const { service, reader, dir, seams } = await fileService();
    const first = await admitAndPublish(service, { executionId: "exec-retry-1" });
    assert.equal(first.outcome, "created");
    const retry = await service.publishCompleted(first.result, first.pair.files);
    assert.equal(retry, "identical");
    const restarted = createAcquisitionService({ store: createFileStore(dir) });
    const got = await restarted.reader.get(
      { principalId: PRINCIPAL_A, executionId: first.executionId, requestHash: first.requestHash },
      SERVER_LATER,
    );
    assert.equal(got.state, "available");
    assert.equal(got.receiptSha256, first.result.receiptSha256);
    assert.equal(got.expiresAt, first.result.expiresAt);
    const opened = await restarted.reader.openVerified(
      {
        principalId: PRINCIPAL_A,
        executionId: first.executionId,
        requestHash: first.requestHash,
        name: "pin-delta.md",
        sha256: first.pair.outputs[1].sha256,
      },
      SERVER_LATER,
    );
    assert.equal(opened.metadata.sha256, first.pair.outputs[1].sha256);
    assert.equal(seams.calls.engineStarts, 0);
  });

  it("precommit pending never becomes available and does not invoke an injected engine spy", async () => {
    const { service, reader, seams } = await fileService();
    const executionId = "exec-precommit";
    const requestHash = frozenHash("lockfile-pin-delta", "pre");
    await service.admit({
      principalId: PRINCIPAL_A,
      executionId,
      requestHash,
      managedOrderTermsHash: termsHash("pre"),
      jobId: "lockfile-pin-delta",
      termsVersion: MANAGED_ORDER_TERMS_SCHEMA,
      createdAt: SERVER_NOW,
      serverNow: SERVER_NOW,
    });
    const got = await reader.get({ principalId: PRINCIPAL_A, executionId, requestHash }, SERVER_LATER);
    assert.equal(got.state, "pending");
    await assert.rejects(
      () =>
        reader.openVerified(
          { principalId: PRINCIPAL_A, executionId, requestHash, name: "pin-delta.json", sha256: frozenHash() },
          SERVER_LATER,
        ),
      (err) => err instanceof AcquisitionRefuse && err.state === "pending",
    );
    assert.equal(seams.calls.runPaidOffer, 0);
    assert.equal(seams.calls.engineStarts, 0);
  });

  it("expiry is persisted, checked on every read, survives restart, and keeps a tombstone after byte deletion", async () => {
    const { service, dir, store } = await fileService();
    const first = await admitAndPublish(service, { executionId: "exec-ttl-1" });
    const artifact = join(store.artifactRoot, first.executionId, "pin-delta.json");
    assert.equal(existsSync(artifact), true);
    const expiredByClock = await service.reader.get(
      { principalId: PRINCIPAL_A, executionId: first.executionId, requestHash: first.requestHash },
      SERVER_EXPIRED,
    );
    assert.equal(expiredByClock.state, "expired");
    await service.expire(
      { principalId: PRINCIPAL_A, executionId: first.executionId, requestHash: first.requestHash },
      SERVER_LATER,
    );
    assert.equal(existsSync(artifact), false);
    const tombstone = await store.getAcquisition(first.executionId);
    assert.equal(tombstone.state, "expired");
    assert.equal(tombstone.principalId, PRINCIPAL_A);
    assert.equal(tombstone.requestHash, first.requestHash);
    assert.equal(tombstone.bytesPurged, true);
    const restarted = createAcquisitionService({ store: createFileStore(dir) });
    const after = await restarted.reader.get(
      { principalId: PRINCIPAL_A, executionId: first.executionId, requestHash: first.requestHash },
      SERVER_NOW,
    );
    assert.equal(after.state, "expired");
    await assert.rejects(
      () =>
        restarted.admit({
          principalId: PRINCIPAL_A,
          executionId: first.executionId,
          requestHash: frozenHash("lockfile-pin-delta", "reuse"),
          managedOrderTermsHash: termsHash("reuse"),
          jobId: "lockfile-pin-delta",
          termsVersion: MANAGED_ORDER_TERMS_SCHEMA,
          createdAt: SERVER_NOW,
          serverNow: SERVER_NOW,
        }),
      (err) => err instanceof AcquisitionRefuse && err.code === "identity-conflict",
    );
  });

  it("substituted or truncated files refuse before exposing bytes", async () => {
    const { service, store, reader } = await fileService();
    const first = await admitAndPublish(service, { executionId: "exec-corrupt-1" });
    const path = join(store.artifactRoot, first.executionId, "pin-delta.json");
    writeFileSync(path, Buffer.from('{"tampered":true}\n'));
    await assert.rejects(
      () =>
        reader.openVerified(
          {
            principalId: PRINCIPAL_A,
            executionId: first.executionId,
            requestHash: first.requestHash,
            name: "pin-delta.json",
            sha256: first.pair.outputs[0].sha256,
          },
          SERVER_LATER,
        ),
      (err) => err instanceof AcquisitionRefuse && err.state === "integrity-failed",
    );
    writeFileSync(path, first.pair.files[0].bytes.subarray(0, 2));
    await assert.rejects(
      () =>
        reader.openVerified(
          {
            principalId: PRINCIPAL_A,
            executionId: first.executionId,
            requestHash: first.requestHash,
            name: "pin-delta.json",
            sha256: first.pair.outputs[0].sha256,
          },
          SERVER_LATER,
        ),
      (err) => err instanceof AcquisitionRefuse && (err.state === "integrity-failed" || err.code === "integrity-failed"),
    );
    const meta = await reader.get(
      { principalId: PRINCIPAL_A, executionId: first.executionId, requestHash: first.requestHash },
      SERVER_LATER,
    );
    assert.equal(meta.state, "available");
  });

  it("capacity exhaustion refuses new admission without evicting identities", async () => {
    const { service, reader } = await fileService({ maxAdmissions: 1 });
    const first = await admitAndPublish(service, { executionId: "exec-cap-1" });
    await assert.rejects(
      () =>
        service.admit({
          principalId: PRINCIPAL_A,
          executionId: "exec-cap-2",
          requestHash: frozenHash("lockfile-pin-delta", "cap2"),
          managedOrderTermsHash: termsHash("cap2"),
          jobId: "lockfile-pin-delta",
          termsVersion: MANAGED_ORDER_TERMS_SCHEMA,
          createdAt: SERVER_NOW,
          serverNow: SERVER_NOW,
        }),
      (err) => err instanceof AcquisitionRefuse && err.code === "capacity-exhausted",
    );
    const still = await reader.get(
      { principalId: PRINCIPAL_A, executionId: first.executionId, requestHash: first.requestHash },
      SERVER_LATER,
    );
    assert.equal(still.state, "available");
    const identical = await service.admit({
      principalId: PRINCIPAL_A,
      executionId: first.executionId,
      requestHash: first.requestHash,
      managedOrderTermsHash: termsHash(first.executionId),
      jobId: "lockfile-pin-delta",
      termsVersion: MANAGED_ORDER_TERMS_SCHEMA,
      createdAt: SERVER_NOW,
      serverNow: SERVER_NOW,
    });
    assert.equal(identical.kind, "identical");
  });

  it("clock rollback and unparseable clocks fail closed", async () => {
    const { service, reader } = await fileService();
    const first = await admitAndPublish(service, { executionId: "exec-clock-1" });
    await assert.rejects(
      () =>
        reader.get(
          { principalId: PRINCIPAL_A, executionId: first.executionId, requestHash: first.requestHash },
          "not-a-clock",
        ),
      (err) => err instanceof AcquisitionRefuse && err.code === "uncertain-clock",
    );
    await assert.rejects(
      () =>
        reader.get(
          { principalId: PRINCIPAL_A, executionId: first.executionId, requestHash: first.requestHash },
          "2026-09-12T12:00:00Z",
        ),
      (err) => err instanceof AcquisitionRefuse && err.code === "uncertain-clock",
    );
  });

  it("GET cannot refresh TTL; competing identical publications keep the first expiry", async () => {
    const { service, reader } = await fileService();
    const first = await admitAndPublish(service, { executionId: "exec-ttl-hold" });
    const later = availableResult({
      principalId: PRINCIPAL_A,
      executionId: first.executionId,
      requestHash: first.requestHash,
      pair: first.pair,
      expiresAt: "2026-09-20T12:00:00Z",
    });
    later.receiptSha256 = first.result.receiptSha256;
    const retry = await service.publishCompleted(later, first.pair.files);
    assert.equal(retry, "identical");
    const got = await reader.get(
      { principalId: PRINCIPAL_A, executionId: first.executionId, requestHash: first.requestHash },
      SERVER_LATER,
    );
    assert.equal(got.expiresAt, first.result.expiresAt);
  });

  it("vendor-budget-impact promised names are bound independently of lockfile-pin-delta", async () => {
    const { service, reader } = await fileService();
    const vendor = await admitAndPublish(service, {
      jobId: "vendor-budget-impact",
      executionId: "exec-vendor-1",
    });
    const got = await reader.get(
      { principalId: PRINCIPAL_A, executionId: vendor.executionId, requestHash: vendor.requestHash },
      SERVER_LATER,
    );
    assert.equal(got.jobId, "vendor-budget-impact");
    assert.deepEqual(
      got.outputs.map((row) => row.name).sort(),
      ["budget-impact.json", "budget-impact.md"],
    );
    await assert.rejects(
      () =>
        reader.openVerified(
          {
            principalId: PRINCIPAL_A,
            executionId: vendor.executionId,
            requestHash: vendor.requestHash,
            name: "pin-delta.json",
            sha256: vendor.pair.outputs[0].sha256,
          },
          SERVER_LATER,
        ),
      (err) => err instanceof AcquisitionRefuse && err.code === "invalid-name",
    );
  });

  it("managed-order terms hash is not interchangeable with the frozen request hash", async () => {
    const frozen = frozenHash("lockfile-pin-delta", "distinct");
    const terms = orderHashTerms({
      schema: MANAGED_ORDER_TERMS_SCHEMA,
      engineId: "lockfile-pin-delta",
      orderId: "ord-distinct",
      enginePin: { package: "useful-jobs", version: "1.0.0", sha256: frozen, bytes: 1 },
      inputs: [{ flag: "--before", sha256: frozen, bytes: 1 }],
    });
    assert.notEqual(frozen, terms);
    const { service, reader } = await fileService();
    const published = await admitAndPublish(service, {
      executionId: "exec-hash-distinct",
      requestHash: frozen,
      managedOrderTermsHash: terms,
    });
    const withTerms = await reader.get(
      { principalId: PRINCIPAL_A, executionId: published.executionId, requestHash: terms },
      SERVER_LATER,
    );
    assert.equal(withTerms.state, "identity-conflict");
    const withFrozen = await reader.get(
      { principalId: PRINCIPAL_A, executionId: published.executionId, requestHash: frozen },
      SERVER_LATER,
    );
    assert.equal(withFrozen.state, "available");
  });

  it("reader has no Range/redirect/HTTP/D14 surface and does not invoke injected enqueue/ack spies", async () => {
    const { reader, seams } = await fileService();
    assert.equal(reader.openVerifiedRange, undefined);
    assert.equal(reader.redirect, undefined);
    assert.equal(reader.acquireToDirectory, undefined);
    assert.equal(reader.enqueue, undefined);
    assert.equal(reader.acknowledge, undefined);
    assert.equal(seams.calls.enqueue, 0);
    assert.equal(seams.calls.acknowledge, 0);
    assert.equal(seams.calls.deliverOnce, 0);
    assert.equal(seams.calls.settlePayment, 0);
    assert.throws(() => seams.spies.enqueue(), /forbidden seam enqueue/);
    assert.equal(seams.calls.enqueue, 1);
  });
});
