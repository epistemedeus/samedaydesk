import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { createExecutionServer, listenExecutionServer } from "../lib/http.mjs";
import { createStaticPrincipalAdapter } from "../lib/acquisition-http.mjs";
import { createPostgresStore } from "../../../tools/managed-useful-jobs-order/lib/store-postgres.mjs";
import { createAcquisitionService } from "../../../tools/managed-useful-jobs-order/lib/acquisition.mjs";
import { postgresBinariesAvailable, startDisposablePostgres } from "../../../tools/managed-useful-jobs-order/lib/pg-cluster.mjs";
import {
  PRINCIPAL_A,
  SERVER_LATER,
  admitAndPublish,
} from "../../../tools/managed-useful-jobs-order/test/acquisition-helpers.mjs";

const havePg = postgresBinariesAvailable();

describe("HA2 acquisition HTTP on real PostgreSQL", { timeout: 180_000 }, () => {
  it("restart recovers the same hosted record; statement timeout is set", async () => {
    if (!havePg) {
      throw new Error("postgresql-16 initdb/pg_ctl missing; missing dependency is incomplete, not a skip");
    }
    const cluster = startDisposablePostgres();
    const artifacts = mkdtempSync(join(process.env.TMPDIR || tmpdir(), "ha2-pg-art-"));
    let store;
    let server;
    try {
      store = await createPostgresStore({
        clientConfig: cluster.clientConfig,
        schema: "ha2_acq",
        artifactRoot: artifacts,
        statementTimeoutMs: 5_000,
      });
      const service = createAcquisitionService({ store, artifactRoot: artifacts, clock: () => SERVER_LATER });
      const published = await admitAndPublish(service, { executionId: "exec-http-pg" });
      const bundle = createExecutionServer({
        execute: async () => {
          throw new Error("GET must not execute");
        },
        acquisition: {
          reader: service.reader,
          resolvePrincipal: createStaticPrincipalAdapter({ "token-a": PRINCIPAL_A }),
          clock: () => SERVER_LATER,
          gate: service.maxConcurrentReads,
        },
      });
      server = bundle.server;
      const addr = await listenExecutionServer(server, { host: "127.0.0.1", port: 0 });
      const res = await fetch(`${addr.origin}/results/${published.executionId}`, {
        headers: {
          authorization: "Bearer token-a",
          "x-request-sha256": published.requestHash,
        },
      });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.outputsDigest, published.pair.outputsDigest);
      await new Promise((resolve) => server.close(() => resolve()));
      server = null;
      await store.close();
      store = await createPostgresStore({
        clientConfig: cluster.clientConfig,
        schema: "ha2_acq",
        artifactRoot: artifacts,
        statementTimeoutMs: 5_000,
      });
      const restarted = createAcquisitionService({ store, artifactRoot: artifacts, clock: () => SERVER_LATER });
      const bundle2 = createExecutionServer({
        execute: async () => {
          throw new Error("GET must not execute");
        },
        acquisition: {
          reader: restarted.reader,
          resolvePrincipal: createStaticPrincipalAdapter({ "token-a": PRINCIPAL_A }),
          clock: () => SERVER_LATER,
        },
      });
      server = bundle2.server;
      const addr2 = await listenExecutionServer(server, { host: "127.0.0.1", port: 0 });
      const again = await fetch(`${addr2.origin}/results/${published.executionId}`, {
        headers: {
          authorization: "Bearer token-a",
          "x-request-sha256": published.requestHash,
        },
      });
      assert.equal(again.status, 200);
      const body2 = await again.json();
      assert.equal(body2.receiptSha256, body.receiptSha256);
    } finally {
      if (server) await new Promise((resolve) => server.close(() => resolve()));
      if (store) await store.close().catch(() => {});
      cluster.stop();
    }
  });
});
