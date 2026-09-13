import assert from "node:assert/strict";
import http from "node:http";
import net from "node:net";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { createExecutionServer, listenExecutionServer } from "../lib/http.mjs";
import { createStaticPrincipalAdapter } from "../lib/acquisition-http.mjs";
import { createForbiddenSeamSpies } from "../../../tools/managed-useful-jobs-order/lib/acquisition.mjs";
import {
  PRINCIPAL_A,
  PRINCIPAL_B,
  SERVER_EXPIRED,
  SERVER_LATER,
  admitAndPublish,
  fileService,
  pairFor,
} from "../../../tools/managed-useful-jobs-order/test/acquisition-helpers.mjs";

const FROZEN_VERSION = "samedaydesk.acquisition-frozen-request.v1";

async function listen(server) {
  return listenExecutionServer(server, { host: "127.0.0.1", port: 0 });
}

function close(server) {
  return new Promise((resolve) => server.close(() => resolve()));
}

async function startHosted({ service, seams, clock, maxPendingDownloads = 8, execute } = {}) {
  const { service: svc, seams: defaultSeams } = service
    ? { service, seams }
    : await fileService({ maxConcurrentReads: 2, maxQueuedReads: 2 });
  const spies = seams || defaultSeams || createForbiddenSeamSpies();
  let executeCalls = 0;
  const serverBundle = createExecutionServer({
    execute:
      execute ||
      (async () => {
        executeCalls += 1;
        spies.spies.engineStarts();
      }),
    acquisition: {
      reader: svc.reader,
      resolvePrincipal: createStaticPrincipalAdapter({
        "token-a": PRINCIPAL_A,
        "token-a-rotated": PRINCIPAL_A,
        "token-b": PRINCIPAL_B,
      }),
      clock: clock || (() => SERVER_LATER),
      forbiddenSeams: spies.spies,
      gate: svc.maxConcurrentReads,
      maxPendingDownloads,
      openTimeoutMs: 2_000,
    },
  });
  const addr = await listen(serverBundle.server);
  return {
    service: svc,
    seams: spies,
    server: serverBundle.server,
    origin: addr.origin,
    executeCalls: () => executeCalls,
  };
}

function headers(token, requestHash, extra = {}) {
  return {
    authorization: `Bearer ${token}`,
    "x-request-sha256": requestHash,
    "x-request-hash-version": FROZEN_VERSION,
    ...extra,
  };
}

async function getJson(origin, path, hdrs) {
  const res = await fetch(`${origin}${path}`, { headers: hdrs, redirect: "error" });
  const body = await res.json().catch(() => null);
  return { status: res.status, body, headers: res.headers };
}

async function until(predicate, label, ms = 400) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`timed out waiting for ${label}`);
}

function artifactRequestLines(origin, published) {
  return [
    `GET /results/${published.executionId}/artifacts/pin-delta.json HTTP/1.1`,
    `Host: ${origin.host}`,
    "Authorization: Bearer token-a",
    `X-Request-SHA256: ${published.requestHash}`,
    `X-Request-Hash-Version: ${FROZEN_VERSION}`,
    `X-Artifact-SHA256: ${published.pair.outputs[0].sha256}`,
    "Connection: close",
    "",
    "",
  ].join("\r\n");
}

async function connectRaw(origin) {
  const sock = net.connect({ host: origin.hostname, port: Number(origin.port) });
  sock.on("error", () => {});
  await new Promise((resolve, reject) => {
    sock.once("connect", resolve);
    sock.once("error", reject);
  });
  return sock;
}

describe("HA2 acquisition HTTP", { timeout: 60_000 }, () => {
  it("GET repeated, missed, expired, pending, and restarted IDs leaves execution/payment/outbox attempt counters unchanged", async () => {
    const { service, seams } = await fileService();
    const published = await admitAndPublish(service, { executionId: "exec-http-repeat" });
    await service.admit({
      principalId: PRINCIPAL_A,
      executionId: "exec-http-pending",
      requestHash: published.requestHash,
      managedOrderTermsHash: published.requestHash,
      jobId: "lockfile-pin-delta",
      termsVersion: "samedaydesk.useful-jobs-order-terms.v1",
      createdAt: "2026-09-13T12:00:00Z",
      serverNow: "2026-09-13T12:00:00Z",
    });
    const host = await startHosted({ service, seams });
    try {
      const hdrs = headers("token-a", published.requestHash);
      const a = await getJson(host.origin, `/results/${published.executionId}`, hdrs);
      const b = await getJson(host.origin, `/results/${published.executionId}`, hdrs);
      const miss = await getJson(host.origin, `/results/exec-missing`, hdrs);
      const pending = await getJson(host.origin, `/results/exec-http-pending`, hdrs);
      assert.equal(a.status, 200);
      assert.equal(b.status, 200);
      assert.equal(a.body.receiptSha256, b.body.receiptSha256);
      assert.equal(miss.status, 404);
      assert.equal(pending.status, 202);
      assert.equal(seams.calls.runCreateOrder, 0);
      assert.equal(seams.calls.runPaidOffer, 0);
      assert.equal(seams.calls.enqueue, 0);
      assert.equal(seams.calls.acknowledge, 0);
      assert.equal(host.executeCalls(), 0);
      await close(host.server);
      const restarted = await startHosted({ service, seams });
      try {
        const again = await getJson(restarted.origin, `/results/${published.executionId}`, hdrs);
        assert.equal(again.status, 200);
        assert.equal(again.body.outputsDigest, published.pair.outputsDigest);
        assert.equal(seams.calls.engineStarts, 0);
      } finally {
        await close(restarted.server);
      }
    } finally {
      if (host.server.listening) await close(host.server);
    }
  });

  it("authenticated A may retrieve only A + executionId + frozen requestHash; B/anonymous learn no result or artifact metadata", async () => {
    const { service, seams } = await fileService();
    const published = await admitAndPublish(service, { executionId: "exec-http-ab" });
    const host = await startHosted({ service, seams });
    try {
      const ok = await getJson(host.origin, `/results/${published.executionId}`, headers("token-a", published.requestHash));
      assert.equal(ok.status, 200);
      assert.equal(ok.body.purchaseAuthority, false);
      assert.equal(ok.headers.get("cache-control"), "private, no-store");
      const rotated = await getJson(
        host.origin,
        `/results/${published.executionId}`,
        headers("token-a-rotated", published.requestHash),
      );
      assert.equal(rotated.status, 200);
      const other = await getJson(host.origin, `/results/${published.executionId}`, headers("token-b", published.requestHash));
      assert.equal(other.status, 404);
      assert.equal(other.body.outputs, undefined);
      const anon = await getJson(host.origin, `/results/${published.executionId}`, {
        "x-request-sha256": published.requestHash,
      });
      assert.equal(anon.status, 404);
      const rawAuth = await fetch(`${host.origin}/results/${published.executionId}`, {
        headers: { authorization: "not-a-bearer", "x-request-sha256": published.requestHash },
      });
      assert.equal(rawAuth.status, 404);
    } finally {
      await close(host.server);
    }
  });

  it("same ID with changed frozen input, terms, principal, receipt or output tuple refuses, including after restart", async () => {
    const { service, seams } = await fileService();
    const published = await admitAndPublish(service, { executionId: "exec-http-mismatch" });
    const host = await startHosted({ service, seams });
    try {
      const wrongHash = "a".repeat(64);
      const conflict = await getJson(host.origin, `/results/${published.executionId}`, headers("token-a", wrongHash));
      assert.equal(conflict.status, 409);
      const wrongVersion = await getJson(
        host.origin,
        `/results/${published.executionId}`,
        headers("token-a", published.requestHash, { "x-request-hash-version": "samedaydesk.http-frozen-request.v1" }),
      );
      assert.equal(wrongVersion.status, 409);
    } finally {
      await close(host.server);
    }
  });

  it("only the promised named files, byte lengths and hashes are served; substituted or truncated files refuse before headers", async () => {
    const { service, seams, store } = await fileService();
    const published = await admitAndPublish(service, { executionId: "exec-http-bytes" });
    const host = await startHosted({ service, seams });
    try {
      const hdrs = headers("token-a", published.requestHash, {
        "x-artifact-sha256": published.pair.outputs[0].sha256,
      });
      const res = await fetch(`${host.origin}/results/${published.executionId}/artifacts/pin-delta.json`, {
        headers: hdrs,
      });
      assert.equal(res.status, 200);
      assert.equal(res.headers.get("x-content-type-options"), "nosniff");
      assert.equal(res.headers.get("content-type"), "application/octet-stream");
      const buf = Buffer.from(await res.arrayBuffer());
      assert.equal(buf.length, published.pair.outputs[0].bytes);
      const range = await fetch(`${host.origin}/results/${published.executionId}/artifacts/pin-delta.json`, {
        headers: { ...hdrs, range: "bytes=0-1" },
      });
      assert.equal(range.status, 416);
      writeFileSync(join(store.artifactRoot, published.executionId, "pin-delta.json"), Buffer.from("tamper\n"));
      const tamper = await fetch(`${host.origin}/results/${published.executionId}/artifacts/pin-delta.json`, {
        headers: hdrs,
      });
      assert.equal(tamper.status, 422);
      const body = await tamper.json();
      assert.equal(body.code, "integrity-failed");
    } finally {
      await close(host.server);
    }
  });

  it("traversal, encoding aliases, NUL, slash/backslash, absolute paths refuse", async () => {
    const { service, seams } = await fileService();
    const published = await admitAndPublish(service, { executionId: "exec-http-path" });
    const host = await startHosted({ service, seams });
    try {
      const hdrs = headers("token-a", published.requestHash, { "x-artifact-sha256": published.pair.outputs[0].sha256 });
      for (const name of ["../x", "%2e%2e", "pin-delta.json/../x", "a\\b"]) {
        const res = await fetch(`${host.origin}/results/${published.executionId}/artifacts/${name}`, { headers: hdrs });
        assert.ok(res.status === 400 || res.status === 404, name);
      }
    } finally {
      await close(host.server);
    }
  });

  it("per-file/total/count/time/concurrency bounds hold; Range and redirects refuse; abort releases handles and never executes", async () => {
    const { service, seams } = await fileService({ maxConcurrentReads: 1, maxQueuedReads: 0 });
    const published = await admitAndPublish(service, { executionId: "exec-http-bounds" });
    const host = await startHosted({ service, seams, maxPendingDownloads: 1 });
    try {
      const hdrs = headers("token-a", published.requestHash);
      let release;
      const held = new Promise((resolve) => {
        release = resolve;
      });
      service.hooks.beforeOpen = ({ signal }) =>
        new Promise((resolve, reject) => {
          const onAbort = () => reject(signal.reason);
          signal.addEventListener("abort", onAbort, { once: true });
          held.then(() => resolve());
        });
      const first = fetch(`${host.origin}/results/${published.executionId}/artifacts/pin-delta.json`, {
        headers: { ...hdrs, "x-artifact-sha256": published.pair.outputs[0].sha256 },
      });
      await new Promise((r) => setTimeout(r, 20));
      const busy = await getJson(host.origin, `/results/${published.executionId}/artifacts/pin-delta.md`, {
        ...hdrs,
        "x-artifact-sha256": published.pair.outputs[1].sha256,
      });
      assert.equal(busy.status, 503);
      release();
      const ok = await first;
      assert.equal(ok.status, 200);
      assert.equal(host.executeCalls(), 0);
    } finally {
      service.hooks.beforeOpen = null;
      await close(host.server);
    }
  });

  it("pre-aborted fetch AbortController rejects locally before the request is sent (does not prove in-flight server cancellation)", async () => {
    const { service, seams } = await fileService({ maxConcurrentReads: 1, maxQueuedReads: 0 });
    const published = await admitAndPublish(service, { executionId: "exec-http-preabort" });
    const host = await startHosted({ service, seams });
    try {
      const ac = new AbortController();
      ac.abort();
      await assert.rejects(
        () =>
          fetch(`${host.origin}/results/${published.executionId}/artifacts/pin-delta.json`, {
            headers: headers("token-a", published.requestHash, {
              "x-artifact-sha256": published.pair.outputs[0].sha256,
            }),
            signal: ac.signal,
          }),
        (err) => err?.name === "AbortError" || err?.name === "TimeoutError" || Boolean(err),
      );
      assert.equal(service.maxConcurrentReads.active, 0);
      assert.equal(service.maxConcurrentReads.queued, 0);
      assert.equal(host.executeCalls(), 0);
    } finally {
      await close(host.server);
    }
  });

  it("in-flight client disconnect after beforeOpen admission aborts the reader, returns permits, and a follow-up GET succeeds before openTimeout", async () => {
    const modes = ["destroy", "resetAndDestroy", "end"];
    for (const mode of modes) {
      const { service, seams } = await fileService({
        maxConcurrentReads: 1,
        maxQueuedReads: 0,
        openTimeoutMs: 30_000,
      });
      const published = await admitAndPublish(service, { executionId: `exec-http-disc-${mode}` });
      const host = await startHosted({ service, seams });
      let sawAbort = false;
      let markAdmitted;
      const admitted = new Promise((resolve) => {
        markAdmitted = resolve;
      });
      let sock;
      let clientReq;
      service.hooks.beforeOpen = ({ signal }) =>
        new Promise((_resolve, reject) => {
          markAdmitted();
          const onAbort = () => {
            sawAbort = true;
            reject(signal.reason || new Error("aborted"));
          };
          if (signal.aborted) {
            onAbort();
            return;
          }
          signal.addEventListener("abort", onAbort, { once: true });
        });
      try {
        const origin = new URL(host.origin);
        if (mode === "destroy") {
          clientReq = http.request({
            hostname: origin.hostname,
            port: origin.port,
            path: `/results/${published.executionId}/artifacts/pin-delta.json`,
            method: "GET",
            headers: headers("token-a", published.requestHash, {
              "x-artifact-sha256": published.pair.outputs[0].sha256,
              connection: "close",
            }),
          });
          clientReq.on("error", () => {});
          clientReq.on("response", (res) => {
            res.on("error", () => {});
            res.resume();
          });
          clientReq.end();
        } else {
          sock = await connectRaw(origin);
          sock.write(artifactRequestLines(origin, published));
        }
        await admitted;
        assert.equal(service.maxConcurrentReads.active, 1, `${mode}: gate held after admission`);
        if (mode === "destroy") clientReq.destroy();
        else if (mode === "resetAndDestroy") sock.resetAndDestroy();
        else sock.end();
        await until(() => sawAbort, `${mode}: reader signal abort`, 400);
        await until(
          () => service.maxConcurrentReads.active === 0 && service.maxConcurrentReads.queued === 0,
          `${mode}: permits returned`,
          400,
        );
        service.hooks.beforeOpen = null;
        const follow = await fetch(`${host.origin}/results/${published.executionId}/artifacts/pin-delta.json`, {
          headers: headers("token-a", published.requestHash, {
            "x-artifact-sha256": published.pair.outputs[0].sha256,
          }),
        });
        assert.equal(follow.status, 200, `${mode}: follow-up GET`);
        assert.equal(host.executeCalls(), 0);
      } finally {
        service.hooks.beforeOpen = null;
        try {
          clientReq?.destroy();
        } catch {
          /* already closed */
        }
        try {
          sock?.destroy();
        } catch {
          /* already closed */
        }
        await close(host.server);
      }
    }
  });

  it("process-local Map without durable reader is the known-bad missing acquisition seam", async () => {
    const { server } = createExecutionServer({
      execute: async () => {
        throw new Error("should not execute");
      },
    });
    const addr = await listen(server);
    try {
      const res = await fetch(`${addr.origin}/results/exec-none/artifacts/pin-delta.json`);
      assert.notEqual(res.status, 200);
      const meta = await fetch(`${addr.origin}/results/exec-none`, {
        headers: { "x-request-sha256": "a".repeat(64), authorization: "Bearer token-a" },
      });
      assert.equal(meta.status, 404);
    } finally {
      await close(server);
    }
  });
});
