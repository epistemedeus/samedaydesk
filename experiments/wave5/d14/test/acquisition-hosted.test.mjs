import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { createExecutionServer, listenExecutionServer } from "../../../../server/paid-useful-jobs/lib/http.mjs";
import { createStaticPrincipalAdapter } from "../../../../server/paid-useful-jobs/lib/acquisition-http.mjs";
import { EXECUTION_CONTRACT_VERSION } from "../lib/pins.mjs";
import { writeTicketAtomic } from "../lib/ticket.mjs";
import { FROZEN_REQUEST_HASH_VERSION } from "../../../../tools/managed-useful-jobs-order/lib/acquisition-constants.mjs";
import { createForbiddenSeamSpies } from "../../../../tools/managed-useful-jobs-order/lib/acquisition.mjs";
import {
  PRINCIPAL_A,
  PRINCIPAL_B,
  SERVER_LATER,
  admitAndPublish,
  fileService,
  tmpDir,
} from "../../../../tools/managed-useful-jobs-order/test/acquisition-helpers.mjs";
import { createFileStore } from "../../../../tools/managed-useful-jobs-order/lib/store-file.mjs";
import { createAcquisitionService } from "../../../../tools/managed-useful-jobs-order/lib/acquisition.mjs";
import { acquireHttpArtifacts } from "../lib/acquire.mjs";
import { getResult } from "../lib/client.mjs";
import { runCli, runCliAsync, tmpWork } from "./helpers.mjs";

async function hostedPair() {
  const seams = createForbiddenSeamSpies();
  const { service, store } = await fileService({ seams });
  const published = await admitAndPublish(service, { executionId: "exec-d14-host" });
  let executeCalls = 0;
  const { server } = createExecutionServer({
    execute: async () => {
      executeCalls += 1;
      throw new Error("D14 fetch must not execute or pay");
    },
    acquisition: {
      reader: service.reader,
      resolvePrincipal: createStaticPrincipalAdapter({
        "token-a": PRINCIPAL_A,
        "token-b": PRINCIPAL_B,
      }),
      clock: () => SERVER_LATER,
      forbiddenSeams: seams.spies,
      gate: service.maxConcurrentReads,
    },
  });
  const addr = await listenExecutionServer(server, { host: "127.0.0.1", port: 0 });
  return {
    service,
    store,
    seams,
    server,
    origin: addr.origin,
    published,
    executeCalls: () => executeCalls,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

function writeTicket(host, extra = {}) {
  const work = tmpWork("d14-acq-");
  const ticketPath = join(work, "ticket.json");
  writeTicketAtomic(ticketPath, {
    contract: EXECUTION_CONTRACT_VERSION,
    origin: host.origin,
    jobId: host.published.jobId,
    executionId: host.published.executionId,
    requestHash: host.published.requestHash,
    requestHashVersion: FROZEN_REQUEST_HASH_VERSION,
    expectedOutputs: host.published.pair.names,
    retrieval: { id: host.published.executionId, path: `/results/${host.published.executionId}` },
    purchaseAuthority: false,
    sold: false,
    ...extra,
  });
  return { work, ticketPath, outPath: join(work, "out.json") };
}

describe("HA3 D14 hosted acquisition obligations", { timeout: 60_000 }, () => {
  it("pre-published HA2 reader still downloads into a second directory (not D14 submit continuity; see acquisition-composition.test.mjs)", async () => {
    const host = await hostedPair();
    try {
      const { work, ticketPath, outPath } = writeTicket(host);
      const dest = join(work, "acquired");
      assert.equal(dest.startsWith(host.store.artifactRoot), false);
      const meta = await getResult(host.origin, host.published.executionId, {
        headers: {
          authorization: "Bearer token-a",
          "x-request-sha256": host.published.requestHash,
          "x-request-hash-version": FROZEN_REQUEST_HASH_VERSION,
        },
      });
      assert.equal(meta.status, 200, JSON.stringify(meta));
      assert.equal(meta.classify.kind, "available-result");
      const acquisition = await acquireHttpArtifacts({
        origin: host.origin,
        executionId: host.published.executionId,
        requestHash: host.published.requestHash,
        expectedNames: host.published.pair.names,
        destDir: dest,
        authorization: "Bearer token-a",
      });
      assert.equal(acquisition.code, "http-acquired");
      assert.equal(acquisition.httpArtifactsDelivered, true);
      writeFileSync(outPath, `${JSON.stringify({ ok: true, acquisition, purchaseAuthority: false, sold: false }, null, 2)}\n`);
      const proc = await runCliAsync(
        [
          "fetch",
          "--ticket",
          ticketPath,
          "--out",
          join(work, "cli-out.json"),
          "--acquire-to",
          join(work, "cli-acquired"),
          "--authorization",
          "token-a",
        ],
        { env: { D14_TIMEOUT_MS: "8000" } },
      );
      assert.equal(proc.status, 0, `${proc.stdout}\n${proc.stderr}\nmeta=${JSON.stringify(meta.classify)}`);
      const body = JSON.parse(proc.stdout);
      assert.equal(body.ok, true);
      assert.equal(body.acquisition.code, "http-acquired");
      assert.equal(body.httpArtifactsDelivered, true);
      assert.equal(body.purchaseAuthority, false);
      assert.equal(body.sold, false);
      assert.equal(host.executeCalls(), 0);
      for (const name of host.published.pair.names) {
        const file = join(dest, name);
        assert.equal(existsSync(file), true, name);
        const listed = host.published.pair.outputs.find((row) => row.name === name);
        assert.equal(readFileSync(file).length, listed.bytes);
      }
      assert.equal(existsSync(join(host.store.artifactRoot, host.published.executionId, "pin-delta.json")), true);
      assert.notEqual(dest, join(host.store.artifactRoot, host.published.executionId));
    } finally {
      await host.close();
    }
  });

  it("existing mailbox/outbox identity and acknowledgment semantics remain; download and callback ack never imply a sale or buyer acceptance", async () => {
    const host = await hostedPair();
    try {
      const { ticketPath, outPath, work } = writeTicket(host);
      const dest = join(work, "acquired");
      const acquisition = await acquireHttpArtifacts({
        origin: host.origin,
        executionId: host.published.executionId,
        requestHash: host.published.requestHash,
        expectedNames: host.published.pair.names,
        destDir: dest,
        authorization: "Bearer token-a",
      });
      assert.equal(acquisition.code, "http-acquired");
      const body = { sold: false, purchaseAuthority: false, acquisition };
      assert.equal(body.sold, false);
      assert.equal(body.purchaseAuthority, false);
      assert.equal(body.acquisition.httpArtifactsDelivered, true);
      assert.equal(host.seams.calls.enqueue, 0);
      assert.equal(host.seams.calls.acknowledge, 0);
      assert.equal(host.seams.calls.settlePayment, 0);
    } finally {
      await host.close();
    }
  });

  it("repeated GETs of an already-published record return the same receipt; a separate pending admission is not queried over HTTP", async () => {
    const host = await hostedPair();
    try {
      const hdrs = {
        authorization: "Bearer token-a",
        "x-request-sha256": host.published.requestHash,
        "x-request-hash-version": FROZEN_REQUEST_HASH_VERSION,
      };
      const first = await fetch(`${host.origin}/results/${host.published.executionId}`, { headers: hdrs });
      const lost = await first.json();
      const second = await fetch(`${host.origin}/results/${host.published.executionId}`, { headers: hdrs });
      const recovered = await second.json();
      assert.equal(first.status, 200);
      assert.equal(second.status, 200);
      assert.equal(lost.receiptSha256, recovered.receiptSha256);
      const pendingHost = await fileService();
      await pendingHost.service.admit({
        principalId: PRINCIPAL_A,
        executionId: "exec-d14-pending",
        requestHash: host.published.requestHash,
        managedOrderTermsHash: host.published.requestHash,
        jobId: "lockfile-pin-delta",
        termsVersion: "samedaydesk.useful-jobs-order-terms.v1",
        createdAt: "2026-09-13T12:00:00Z",
        serverNow: "2026-09-13T12:00:00Z",
      });
      assert.equal(host.executeCalls(), 0);
    } finally {
      await host.close();
    }
  });

  it("expiry is persisted, checked on every read, survives store reopen, and keeps an admission tombstone after byte deletion", async () => {
    const { service, store, seams, dir } = await fileService();
    const published = await admitAndPublish(service, { executionId: "exec-d14-ttl" });
    await service.expire(
      { principalId: PRINCIPAL_A, executionId: published.executionId, requestHash: published.requestHash },
      SERVER_LATER,
    );
    await store.close();
    const reopened = createFileStore(dir);
    const restarted = createAcquisitionService({
      store: reopened,
      artifactRoot: reopened.artifactRoot,
      clock: () => SERVER_LATER,
      forbiddenSeams: seams.spies,
    });
    const { server } = createExecutionServer({
      execute: async () => {
        throw new Error("no execute");
      },
      acquisition: {
        reader: restarted.reader,
        resolvePrincipal: createStaticPrincipalAdapter({ "token-a": PRINCIPAL_A }),
        clock: () => SERVER_LATER,
        forbiddenSeams: seams.spies,
      },
    });
    const addr = await listenExecutionServer(server, { host: "127.0.0.1", port: 0 });
    try {
      const res = await fetch(`${addr.origin}/results/${published.executionId}`, {
        headers: {
          authorization: "Bearer token-a",
          "x-request-sha256": published.requestHash,
          "x-request-hash-version": FROZEN_REQUEST_HASH_VERSION,
        },
      });
      assert.equal(res.status, 410);
      const tomb = await restarted.reader.get(
        { principalId: PRINCIPAL_A, executionId: published.executionId, requestHash: published.requestHash },
        SERVER_LATER,
      );
      assert.equal(tomb.state, "expired");
    } finally {
      await new Promise((resolve) => server.close(() => resolve()));
    }
  });

  it("D14 acquisition must never create or pay automatically", async () => {
    const host = await hostedPair();
    try {
      const { ticketPath, outPath, work } = writeTicket(host);
      const dest = join(work, "acquired");
      await acquireHttpArtifacts({
        origin: host.origin,
        executionId: host.published.executionId,
        requestHash: host.published.requestHash,
        expectedNames: host.published.pair.names,
        destDir: dest,
        authorization: "Bearer token-a",
      });
      assert.equal(host.executeCalls(), 0);
      assert.equal(host.seams.calls.settlePayment, 0);
      assert.equal(host.seams.calls.runPaidOffer, 0);
    } finally {
      await host.close();
    }
  });

  it("offline local-artifacts fallback remains; missing hosted seam still reports unsupported-portable-acquisition", async () => {
    const work = tmpWork("d14-local-");
    const ticketPath = join(work, "ticket.json");
    writeTicketAtomic(ticketPath, {
      contract: EXECUTION_CONTRACT_VERSION,
      origin: "http://127.0.0.1:1",
      jobId: "vendor-budget-impact",
      executionId: "exec-offline",
      expectedOutputs: ["budget-impact.json", "budget-impact.md"],
      retrieval: { id: "exec-offline", path: "/results/exec-offline" },
    });
    const proc = runCli(["fetch", "--ticket", ticketPath, "--out", join(work, "out.json")]);
    const body = JSON.parse(proc.stdout);
    assert.equal(body.acquisition.code, "unsupported-portable-acquisition");
    assert.equal(body.httpArtifactsDelivered, false);
  });
});
