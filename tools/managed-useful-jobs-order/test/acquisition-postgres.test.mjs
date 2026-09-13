import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { AcquisitionRefuse } from "../lib/acquisition-errors.mjs";
import { createPostgresStore } from "../lib/store-postgres.mjs";
import { createAcquisitionService } from "../lib/acquisition.mjs";
import { postgresBinariesAvailable, startDisposablePostgres } from "../lib/pg-cluster.mjs";
import { MANAGED_ORDER_TERMS_SCHEMA } from "../lib/acquisition-constants.mjs";
import {
  PRINCIPAL_A,
  PRINCIPAL_B,
  SERVER_EXPIRED,
  SERVER_LATER,
  SERVER_NOW,
  admitAndPublish,
  availableResult,
  frozenHash,
  pairFor,
  createForbiddenSeamSpies,
  termsHash,
} from "./acquisition-helpers.mjs";

const havePg = postgresBinariesAvailable();

function artifactDir() {
  return mkdtempSync(join(process.env.TMPDIR || tmpdir(), "ha1-pg-art-"));
}

describe("HA1 real PostgreSQL durable retrieval", { timeout: 180_000 }, () => {
  it("restart, competing publications, mismatch and tombstones on an isolated cluster", async () => {
    if (!havePg) {
      throw new Error("postgresql-16 initdb/pg_ctl missing; missing dependency is incomplete, not a skip");
    }
    const cluster = startDisposablePostgres();
    const artifacts = artifactDir();
    let storeA;
    let storeB;
    try {
      storeA = await createPostgresStore({
        clientConfig: cluster.clientConfig,
        schema: "managed_useful_jobs_order",
        artifactRoot: artifacts,
        maxAdmissions: 8,
      });
      const serviceA = createAcquisitionService({
        store: storeA,
        artifactRoot: artifacts,
        maxAdmissions: 8,
      });
      const pendingId = "exec-pg-race";
      const pendingHash = frozenHash("lockfile-pin-delta", "race");
      const pendingPair = pairFor("lockfile-pin-delta", "race");
      await serviceA.admit({
        principalId: PRINCIPAL_A,
        executionId: pendingId,
        requestHash: pendingHash,
        managedOrderTermsHash: termsHash("race"),
        jobId: "lockfile-pin-delta",
        termsVersion: MANAGED_ORDER_TERMS_SCHEMA,
        createdAt: SERVER_NOW,
        serverNow: SERVER_NOW,
      });
      storeB = await createPostgresStore({
        clientConfig: cluster.clientConfig,
        schema: "managed_useful_jobs_order",
        artifactRoot: artifacts,
        maxAdmissions: 8,
      });
      const racer = createAcquisitionService({
        store: storeB,
        artifactRoot: artifacts,
        maxAdmissions: 8,
      });
      const raceResult = availableResult({
        principalId: PRINCIPAL_A,
        executionId: pendingId,
        requestHash: pendingHash,
        pair: pendingPair,
      });
      const raced = await Promise.all([
        serviceA.publishCompleted(raceResult, pendingPair.files),
        racer.publishCompleted(raceResult, pendingPair.files),
      ]);
      assert.ok(raced.includes("created"));
      assert.ok(raced.every((kind) => kind === "created" || kind === "identical"));

      const first = await admitAndPublish(serviceA, { executionId: "exec-pg-1" });
      assert.equal(first.outcome, "created");

      await storeA.close();
      storeA = await createPostgresStore({
        clientConfig: cluster.clientConfig,
        schema: "managed_useful_jobs_order",
        artifactRoot: artifacts,
        maxAdmissions: 8,
      });
      const restarted = createAcquisitionService({
        store: storeA,
        artifactRoot: artifacts,
        maxAdmissions: 8,
      });
      const recovered = await restarted.reader.get(
        { principalId: PRINCIPAL_A, executionId: first.executionId, requestHash: first.requestHash },
        SERVER_LATER,
      );
      assert.equal(recovered.state, "available");
      assert.equal(recovered.receiptSha256, first.result.receiptSha256);

      const serviceB = createAcquisitionService({
        store: storeB,
        artifactRoot: artifacts,
        maxAdmissions: 8,
      });
      const [left, right] = await Promise.all([
        restarted.publishCompleted(first.result, first.pair.files),
        serviceB.publishCompleted(first.result, first.pair.files),
      ]);
      const kinds = [left, right].sort();
      assert.deepEqual(kinds, ["identical", "identical"]);

      const otherPair = pairFor("lockfile-pin-delta", "pg-mismatch");
      await assert.rejects(
        () =>
          serviceB.publishCompleted(
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

      const otherPrincipal = await restarted.reader.get(
        { principalId: PRINCIPAL_B, executionId: first.executionId, requestHash: first.requestHash },
        SERVER_LATER,
      );
      assert.equal(otherPrincipal.state, "not-found");

      await restarted.expire(
        { principalId: PRINCIPAL_A, executionId: first.executionId, requestHash: first.requestHash },
        SERVER_LATER,
      );
      const expired = await serviceB.reader.get(
        { principalId: PRINCIPAL_A, executionId: first.executionId, requestHash: first.requestHash },
        SERVER_NOW,
      );
      assert.equal(expired.state, "expired");
      const tombstone = await storeB.getAcquisition(first.executionId);
      assert.equal(tombstone.bytesPurged, true);
      assert.equal(tombstone.principalId, PRINCIPAL_A);
      await assert.rejects(
        () =>
          serviceB.admit({
            principalId: PRINCIPAL_A,
            executionId: first.executionId,
            requestHash: frozenHash("lockfile-pin-delta", "reuse-pg"),
            managedOrderTermsHash: termsHash("reuse-pg"),
            jobId: "lockfile-pin-delta",
            termsVersion: MANAGED_ORDER_TERMS_SCHEMA,
            createdAt: SERVER_NOW,
            serverNow: SERVER_NOW,
          }),
        (err) => err instanceof AcquisitionRefuse && err.code === "identity-conflict",
      );
    } finally {
      if (storeA) await storeA.close().catch(() => {});
      if (storeB) await storeB.close().catch(() => {});
      cluster.stop();
    }
  });

  it("capacity exhaustion on postgres cannot evict a live identity", async () => {
    if (!havePg) {
      throw new Error("postgresql-16 initdb/pg_ctl missing; missing dependency is incomplete, not a skip");
    }
    const cluster = startDisposablePostgres();
    const artifacts = artifactDir();
    let store;
    try {
      store = await createPostgresStore({
        clientConfig: cluster.clientConfig,
        schema: "ha1_cap",
        artifactRoot: artifacts,
        maxAdmissions: 1,
      });
      const service = createAcquisitionService({
        store,
        artifactRoot: artifacts,
        maxAdmissions: 1,
      });
      const first = await admitAndPublish(service, { executionId: "exec-pg-cap-1" });
      await assert.rejects(
        () =>
          service.admit({
            principalId: PRINCIPAL_A,
            executionId: "exec-pg-cap-2",
            requestHash: frozenHash("lockfile-pin-delta", "pg-cap-2"),
            managedOrderTermsHash: termsHash("pg-cap-2"),
            jobId: "lockfile-pin-delta",
            termsVersion: MANAGED_ORDER_TERMS_SCHEMA,
            createdAt: SERVER_NOW,
            serverNow: SERVER_NOW,
          }),
        (err) => err instanceof AcquisitionRefuse && err.code === "capacity-exhausted",
      );
      const still = await service.reader.get(
        { principalId: PRINCIPAL_A, executionId: first.executionId, requestHash: first.requestHash },
        SERVER_LATER,
      );
      assert.equal(still.state, "available");
    } finally {
      if (store) await store.close().catch(() => {});
      cluster.stop();
    }
  });

  it("clock-expired postgres rows refuse openVerified without side effects", async () => {
    if (!havePg) {
      throw new Error("postgresql-16 initdb/pg_ctl missing; missing dependency is incomplete, not a skip");
    }
    const cluster = startDisposablePostgres();
    const artifacts = artifactDir();
    let store;
    try {
      store = await createPostgresStore({
        clientConfig: cluster.clientConfig,
        schema: "ha1_ttl",
        artifactRoot: artifacts,
      });
      const seams = createForbiddenSeamSpies();
      const service = createAcquisitionService({
        store,
        artifactRoot: artifacts,
        forbiddenSeams: seams.spies,
      });
      const first = await admitAndPublish(service, { executionId: "exec-pg-ttl" });
      const before = { ...seams.calls };
      const expired = await service.reader.get(
        { principalId: PRINCIPAL_A, executionId: first.executionId, requestHash: first.requestHash },
        SERVER_EXPIRED,
      );
      assert.equal(expired.state, "expired");
      await assert.rejects(
        () =>
          service.reader.openVerified(
            {
              principalId: PRINCIPAL_A,
              executionId: first.executionId,
              requestHash: first.requestHash,
              name: "pin-delta.json",
              sha256: first.pair.outputs[0].sha256,
            },
            SERVER_EXPIRED,
          ),
        (err) => err instanceof AcquisitionRefuse && err.state === "expired",
      );
      assert.equal(seams.calls.runCreateOrder, before.runCreateOrder);
      assert.equal(seams.calls.enqueue, 0);
      assert.throws(() => seams.spies.enqueue(), /forbidden seam enqueue/);
      assert.equal(seams.calls.enqueue, 1);
    } finally {
      if (store) await store.close().catch(() => {});
      cluster.stop();
    }
  });

  it("same-store concurrent admits use leased clients; statement_timeout is observed on a slow query", async () => {
    if (!havePg) {
      throw new Error("postgresql-16 initdb/pg_ctl missing; missing dependency is incomplete, not a skip");
    }
    const cluster = startDisposablePostgres();
    const artifacts = artifactDir();
    let store;
    try {
      store = await createPostgresStore({
        clientConfig: cluster.clientConfig,
        schema: "ha1_acq_lease",
        artifactRoot: artifacts,
        statementTimeoutMs: 500,
      });
      const shown = await store.withLeasedClient(async (client) => {
        const { rows } = await client.query("SHOW statement_timeout");
        return rows[0].statement_timeout;
      });
      assert.ok(/500ms|0.5s|500/i.test(String(shown)), `statement_timeout=${shown}`);
      const service = createAcquisitionService({ store, artifactRoot: artifacts, clock: () => SERVER_LATER });
      const [a, b] = await Promise.all([
        admitAndPublish(service, { executionId: "exec-lease-a" }),
        admitAndPublish(service, { executionId: "exec-lease-b" }),
      ]);
      assert.equal(a.outcome === "created" || a.outcome === "identical", true);
      assert.equal(b.outcome === "created" || b.outcome === "identical", true);
      await assert.rejects(
        () => store.withLeasedClient((client) => client.query("SELECT pg_sleep(2)")),
        (err) => err && (err.code === "57014" || /timeout/i.test(String(err.message))),
      );
    } finally {
      if (store) await store.close().catch(() => {});
      cluster.stop();
    }
  });
});
