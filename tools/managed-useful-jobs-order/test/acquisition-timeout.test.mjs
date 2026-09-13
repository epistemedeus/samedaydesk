import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AcquisitionRefuse } from "../lib/acquisition-errors.mjs";
import {
  PRINCIPAL_A,
  SERVER_EXPIRED,
  SERVER_LATER,
  admitAndPublish,
  fileService,
} from "./acquisition-helpers.mjs";

function holdUntilAbortOrRelease(signal, released) {
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (fn, value) => {
      if (done) return;
      done = true;
      signal?.removeEventListener?.("abort", onAbort);
      fn(value);
    };
    const onAbort = () => {
      const reason = signal.reason;
      finish(reject, reason instanceof Error ? reason : new AcquisitionRefuse("aborted", "held open aborted"));
    };
    if (signal?.aborted) {
      onAbort();
      return;
    }
    signal?.addEventListener?.("abort", onAbort, { once: true });
    Promise.resolve(released).then(
      () => finish(resolve),
      (err) => finish(reject, err),
    );
  });
}

async function until(predicate, label, ms = 300) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`timed out waiting for ${label}`);
}

describe("HA1 read-gate and operation deadlines", { timeout: 10_000 }, () => {
  it("queued open times out without taking a permit and does not wait 30s", async () => {
    const { service, reader } = await fileService({ maxConcurrentReads: 1, openTimeoutMs: 2000 });
    const first = await admitAndPublish(service, { executionId: "exec-timeout-queue" });
    const binding = {
      principalId: PRINCIPAL_A,
      executionId: first.executionId,
      requestHash: first.requestHash,
      name: "pin-delta.json",
      sha256: first.pair.outputs[0].sha256,
    };
    let releaseHold;
    const held = new Promise((resolve) => {
      releaseHold = resolve;
    });
    service.hooks.beforeOpen = ({ signal }) => holdUntilAbortOrRelease(signal, held);
    const holder = reader.openVerified(binding, SERVER_LATER);
    await until(() => service.maxConcurrentReads.active === 1, "holder permit");
    const t0 = Date.now();
    await assert.rejects(
      () => reader.openVerified(binding, SERVER_LATER, { openTimeoutMs: 40 }),
      (err) => err instanceof AcquisitionRefuse && err.code === "timeout",
    );
    assert.ok(Date.now() - t0 < 1000, "queue timeout must be the short bound, not 30s");
    assert.equal(service.maxConcurrentReads.active, 1);
    assert.equal(service.maxConcurrentReads.queued, 0);
    service.hooks.beforeOpen = null;
    releaseHold();
    const opened = await holder;
    assert.equal(opened.metadata.sha256, first.pair.outputs[0].sha256);
    assert.equal(service.maxConcurrentReads.active, 0);
  });

  it("stalled hook is bound by the operation deadline and releases the permit", async () => {
    const { service, reader } = await fileService({ maxConcurrentReads: 1, openTimeoutMs: 40 });
    const first = await admitAndPublish(service, { executionId: "exec-timeout-op" });
    service.hooks.beforeOpen = ({ signal }) =>
      new Promise((_, reject) => {
        const onAbort = () => reject(signal.reason instanceof Error ? signal.reason : new Error("aborted"));
        if (signal.aborted) onAbort();
        else signal.addEventListener("abort", onAbort, { once: true });
      });
    const t0 = Date.now();
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
      (err) => err instanceof AcquisitionRefuse && err.code === "timeout",
    );
    assert.ok(Date.now() - t0 < 1000);
    assert.equal(service.maxConcurrentReads.active, 0);
    assert.equal(service.maxConcurrentReads.queued, 0);
    service.hooks.beforeOpen = null;
    const opened = await reader.openVerified(
      {
        principalId: PRINCIPAL_A,
        executionId: first.executionId,
        requestHash: first.requestHash,
        name: "pin-delta.json",
        sha256: first.pair.outputs[0].sha256,
      },
      SERVER_LATER,
    );
    assert.equal(opened.metadata.bytes, first.pair.outputs[0].bytes);
  });

  it("already-aborted signal never acquires a permit", async () => {
    const { service, reader } = await fileService({ maxConcurrentReads: 1, openTimeoutMs: 200 });
    const first = await admitAndPublish(service, { executionId: "exec-timeout-preabort" });
    const ac = new AbortController();
    ac.abort();
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
          { signal: ac.signal },
        ),
      (err) => err instanceof AcquisitionRefuse && err.code === "aborted",
    );
    assert.equal(service.maxConcurrentReads.active, 0);
    assert.equal(service.maxConcurrentReads.queued, 0);
  });

  it("keeps active at or below the configured cap under contention", async () => {
    const { service, reader } = await fileService({ maxConcurrentReads: 2, openTimeoutMs: 2000 });
    const first = await admitAndPublish(service, { executionId: "exec-timeout-cap" });
    const binding = {
      principalId: PRINCIPAL_A,
      executionId: first.executionId,
      requestHash: first.requestHash,
      name: "pin-delta.json",
      sha256: first.pair.outputs[0].sha256,
    };
    const holds = [];
    let started = 0;
    service.hooks.beforeOpen = ({ signal }) => {
      started += 1;
      if (started <= 2) {
        const held = new Promise((resolve) => holds.push(resolve));
        return holdUntilAbortOrRelease(signal, held);
      }
      return Promise.resolve();
    };
    const a = reader.openVerified(binding, SERVER_LATER);
    const b = reader.openVerified(binding, SERVER_LATER);
    await until(() => holds.length === 2 && service.maxConcurrentReads.active === 2, "two hooks holding");
    const c = reader.openVerified(binding, SERVER_LATER, { clock: () => SERVER_LATER });
    await until(() => service.maxConcurrentReads.queued === 1, "third queued");
    assert.equal(service.maxConcurrentReads.active, 2);
    assert.ok(service.maxConcurrentReads.active <= service.maxConcurrentReads.max);
    holds.forEach((release) => release());
    const results = await Promise.all([a, b, c]);
    assert.equal(results.length, 3);
    assert.equal(service.maxConcurrentReads.active, 0);
    assert.equal(service.maxConcurrentReads.queued, 0);
  });

  it("after a gate wait, a frozen serverNow is not treated as a fresh clock", async () => {
    const { service, reader } = await fileService({ maxConcurrentReads: 1, openTimeoutMs: 2000 });
    const first = await admitAndPublish(service, { executionId: "exec-timeout-stale-clock" });
    const binding = {
      principalId: PRINCIPAL_A,
      executionId: first.executionId,
      requestHash: first.requestHash,
      name: "pin-delta.json",
      sha256: first.pair.outputs[0].sha256,
    };
    let releaseHold;
    const held = new Promise((resolve) => {
      releaseHold = resolve;
    });
    service.hooks.beforeOpen = ({ signal }) => holdUntilAbortOrRelease(signal, held);
    const holder = reader.openVerified(binding, SERVER_LATER);
    await until(() => service.maxConcurrentReads.active === 1, "holder");
    const queued = reader.openVerified(binding, SERVER_LATER, { openTimeoutMs: 2000 });
    await until(() => service.maxConcurrentReads.queued === 1, "queued waiter");
    service.hooks.beforeOpen = null;
    releaseHold();
    await holder;
    await assert.rejects(
      queued,
      (err) => err instanceof AcquisitionRefuse && err.code === "uncertain-clock",
    );
    assert.equal(service.maxConcurrentReads.active, 0);
  });

  it("re-samples an injected trusted clock after waiting and refuses expiry", async () => {
    let now = SERVER_LATER;
    const { service, reader } = await fileService({
      maxConcurrentReads: 1,
      openTimeoutMs: 2000,
    });
    const first = await admitAndPublish(service, { executionId: "exec-timeout-clock" });
    const binding = {
      principalId: PRINCIPAL_A,
      executionId: first.executionId,
      requestHash: first.requestHash,
      name: "pin-delta.json",
      sha256: first.pair.outputs[0].sha256,
    };
    let releaseHold;
    const held = new Promise((resolve) => {
      releaseHold = resolve;
    });
    let holds = 0;
    service.hooks.beforeOpen = ({ signal }) => {
      holds += 1;
      if (holds === 1) return holdUntilAbortOrRelease(signal, held);
      return Promise.resolve();
    };
    const holder = reader.openVerified(binding, SERVER_LATER);
    await until(() => service.maxConcurrentReads.active === 1, "holder");
    const queued = reader.openVerified(binding, SERVER_LATER, { clock: () => now });
    await until(() => service.maxConcurrentReads.queued === 1, "queued waiter");
    now = SERVER_EXPIRED;
    releaseHold();
    await holder;
    await assert.rejects(
      queued,
      (err) => err instanceof AcquisitionRefuse && (err.state === "expired" || err.code === "expired"),
    );
    assert.equal(service.maxConcurrentReads.active, 0);
  });
});
