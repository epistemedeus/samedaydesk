import {
  DEFAULT_MAX_ADMISSIONS,
  DEFAULT_MAX_CONCURRENT_READS,
  DEFAULT_OPEN_TIMEOUT_MS,
  DEFAULT_TTL_SECONDS,
  FROZEN_REQUEST_HASH_VERSION,
  HA1_JOB_IDS,
  REQUEST_HASH_ALGORITHM,
} from "./acquisition-constants.mjs";
import { acquisitionRefuse } from "./acquisition-errors.mjs";
import { assertArtifactName, assertRetrievalBinding, assertSha256 } from "./acquisition-binding.mjs";
import { addTtl, assertClockSane, parseServerClock } from "./acquisition-clock.mjs";
import {
  assertAvailableResult,
  assertVerifiedFiles,
  hashReceiptProjection,
  newAdmissionRecord,
  publicAvailableResult,
  sameAdmissionIdentity,
  samePublicationIdentity,
} from "./acquisition-identity.mjs";
import { purgeArtifactDir, readVerifiedBytes, writeVerifiedArtifacts } from "./acquisition-bytes.mjs";

function createReadGate(max) {
  let active = 0;
  const waiters = [];
  return {
    get active() {
      return active;
    },
    async acquire(signal) {
      if (signal?.aborted) {
        throw acquisitionRefuse("aborted", "read gate released without acquiring");
      }
      if (active < max) {
        active += 1;
        return () => {
          active -= 1;
          const next = waiters.shift();
          if (next) next();
        };
      }
      await new Promise((resolve, reject) => {
        const waiter = () => {
          signal?.removeEventListener?.("abort", onAbort);
          resolve();
        };
        const onAbort = () => {
          const idx = waiters.indexOf(waiter);
          if (idx >= 0) waiters.splice(idx, 1);
          reject(acquisitionRefuse("aborted", "read gate wait aborted"));
        };
        waiters.push(waiter);
        signal?.addEventListener?.("abort", onAbort, { once: true });
      });
      active += 1;
      return () => {
        active -= 1;
        const next = waiters.shift();
        if (next) next();
      };
    },
  };
}

function emptySideEffects() {
  return {
    runCreateOrder: 0,
    runPaidOffer: 0,
    settlePayment: 0,
    deliverOnce: 0,
    enqueue: 0,
    acknowledge: 0,
    engineStarts: 0,
  };
}

function classifyGet(record, binding, serverNow) {
  if (!record) return { state: "not-found" };
  if (record.principalId !== binding.principalId) return { state: "not-found" };
  if (record.requestHash !== binding.requestHash) {
    return { state: "identity-conflict" };
  }
  if (record.purchaseAuthority === true || record.sold === true) {
    return { state: "integrity-failed" };
  }
  const clock = assertClockSane({
    serverNow,
    createdAt: record.createdAt,
    expiresAt: record.expiresAt,
  });
  if (record.state === "expired" || record.bytesPurged || clock.expired) {
    return { state: "expired" };
  }
  if (record.state === "identity-conflict") return { state: "identity-conflict" };
  if (record.state === "integrity-failed") return { state: "integrity-failed" };
  if (record.state === "pending" || !record.outputs) return { state: "pending" };
  if (record.state !== "available") return { state: "integrity-failed" };
  return { state: "available", record, clock };
}

export function createAcquisitionService({
  store,
  artifactRoot = null,
  maxAdmissions = DEFAULT_MAX_ADMISSIONS,
  maxConcurrentReads = DEFAULT_MAX_CONCURRENT_READS,
  ttlSeconds = DEFAULT_TTL_SECONDS,
  openTimeoutMs = DEFAULT_OPEN_TIMEOUT_MS,
} = {}) {
  if (!store || typeof store.admitAcquisition !== "function") {
    throw acquisitionRefuse(
      "store-unavailable",
      "acquisition requires a managed-order store with durable admit/get/save",
    );
  }
  const root = artifactRoot || store.artifactRoot;
  if (!root) {
    throw acquisitionRefuse("store-unavailable", "acquisition requires a private artifact root");
  }
  const cap = Number.isSafeInteger(maxAdmissions) && maxAdmissions > 0 ? maxAdmissions : DEFAULT_MAX_ADMISSIONS;
  const gate = createReadGate(
    Number.isSafeInteger(maxConcurrentReads) && maxConcurrentReads > 0
      ? maxConcurrentReads
      : DEFAULT_MAX_CONCURRENT_READS,
  );
  const timeoutMs =
    Number.isSafeInteger(openTimeoutMs) && openTimeoutMs > 0 ? openTimeoutMs : DEFAULT_OPEN_TIMEOUT_MS;
  const sideEffects = emptySideEffects();
  const hooks = {
    afterOpenFd: null,
  };

  async function load(executionId) {
    try {
      return await store.getAcquisition(executionId);
    } catch (err) {
      if (err && err.code === "corrupt-replay") {
        throw acquisitionRefuse("integrity-failed", "acquisition record is corrupt", {
          state: "integrity-failed",
        });
      }
      throw err;
    }
  }

  async function admit(input) {
    if (!HA1_JOB_IDS.includes(input.jobId)) {
      throw acquisitionRefuse("invalid-binding", "admission is only for the two HA1 jobs");
    }
    const createdAt = parseServerClock(input.createdAt || input.serverNow, "createdAt").iso;
    const expiresAt = input.expiresAt
      ? parseServerClock(input.expiresAt, "expiresAt").iso
      : addTtl(createdAt, ttlSeconds);
    assertClockSane({ serverNow: input.serverNow || createdAt, createdAt, expiresAt });
    const record = newAdmissionRecord({ ...input, createdAt, expiresAt });
    const outcome = await store.admitAcquisition(record, { maxAdmissions: cap });
    if (outcome.kind === "capacity") {
      throw acquisitionRefuse(
        "capacity-exhausted",
        "admission capacity exhausted; identities are not evicted and execution IDs are not reused",
      );
    }
    if (outcome.kind === "conflict") {
      throw acquisitionRefuse(
        "identity-conflict",
        "executionId already holds a different principal/request/job identity",
        { state: "identity-conflict", detail: { executionId: record.executionId } },
      );
    }
    return outcome;
  }

  async function publishCompleted(result, verifiedFiles) {
    const available = assertAvailableResult(result);
    const files = assertVerifiedFiles(available.outputs, verifiedFiles);
    const binding = assertRetrievalBinding(available);
    if (available.requestHash !== binding.requestHash) {
      throw acquisitionRefuse("identity-conflict", "published requestHash does not match the binding");
    }
    return store.withAcquisitionLock(available.executionId, async () => {
      const existing = await store.getAcquisition(available.executionId);
      if (!existing) {
        throw acquisitionRefuse("missing-admission", "publishCompleted requires a prior admission/reservation");
      }
      if (existing.principalId !== available.principalId) {
        throw acquisitionRefuse("identity-conflict", "publication principal does not match admission", {
          state: "identity-conflict",
        });
      }
      if (existing.requestHash !== available.requestHash || existing.jobId !== available.jobId) {
        throw acquisitionRefuse("identity-conflict", "publication request or job does not match admission", {
          state: "identity-conflict",
        });
      }
      if (existing.state === "expired" || existing.bytesPurged) {
        throw acquisitionRefuse("expired", "expired admission cannot be republished", { state: "expired" });
      }
      const published = {
        ...existing,
        receiptSha256: assertSha256(available.receiptSha256, "receiptSha256"),
        outputsDigest: available.outputsDigest,
        outputs: available.outputs,
        sample: Boolean(available.sample),
        state: "available",
        purchaseAuthority: false,
        sold: false,
      };
      if (existing.state === "available" && existing.outputs) {
        if (!samePublicationIdentity(existing, published)) {
          throw acquisitionRefuse(
            "identity-conflict",
            "repeated publication must match principal/request/receipt/output identity",
            { state: "identity-conflict" },
          );
        }
        return "identical";
      }
      writeVerifiedArtifacts(root, available.executionId, files);
      await store.saveAcquisitionUnlocked(published);
      return "created";
    });
  }

  async function expire(binding, serverNow) {
    const bound = assertRetrievalBinding(binding);
    parseServerClock(serverNow, "serverNow");
    await store.withAcquisitionLock(bound.executionId, async () => {
      const existing = await store.getAcquisition(bound.executionId);
      if (!existing || existing.principalId !== bound.principalId) {
        throw acquisitionRefuse("not-found", "no admission for this binding", { state: "not-found" });
      }
      if (existing.requestHash !== bound.requestHash) {
        throw acquisitionRefuse("identity-conflict", "expire binding requestHash does not match", {
          state: "identity-conflict",
        });
      }
      existing.state = "expired";
      await store.saveAcquisitionUnlocked(existing);
      try {
        purgeArtifactDir(root, bound.executionId);
        existing.bytesPurged = true;
        existing.outputs = existing.outputs || null;
        await store.saveAcquisitionUnlocked(existing);
      } catch {
        existing.state = "expired";
        await store.saveAcquisitionUnlocked(existing);
      }
    });
  }

  async function get(binding, serverNow) {
    const bound = assertRetrievalBinding(binding);
    parseServerClock(serverNow, "serverNow");
    const record = await load(bound.executionId);
    const classified = classifyGet(record, bound, serverNow);
    if (classified.state !== "available") return { state: classified.state };
    return publicAvailableResult(classified.record);
  }

  async function openVerified(binding, serverNow, extra = {}) {
    const bound = assertRetrievalBinding(binding);
    const sha256 = assertSha256(binding.sha256, "artifact sha256");
    const started = Date.now();
    const signal = extra.signal;
    const release = await gate.acquire(signal);
    try {
      if (Date.now() - started > timeoutMs) {
        throw acquisitionRefuse("aborted", "artifact open exceeded the 30-second bound");
      }
      const record = await load(bound.executionId);
      const classified = classifyGet(record, bound, serverNow);
      if (classified.state === "not-found") {
        throw acquisitionRefuse("not-found", "no available artifact for this binding", { state: "not-found" });
      }
      if (classified.state === "pending") {
        throw acquisitionRefuse("pending", "result is not committed available", { state: "pending" });
      }
      if (classified.state === "expired") {
        throw acquisitionRefuse("expired", "result expiry has removed access", { state: "expired" });
      }
      if (classified.state !== "available") {
        throw acquisitionRefuse(classified.state, "artifact cannot be opened", { state: classified.state });
      }
      const name = assertArtifactName(binding.name, classified.record.jobId);
      const expected = classified.record.outputs.find((row) => row.name === name);
      if (!expected || expected.sha256 !== sha256) {
        throw acquisitionRefuse("integrity-failed", "requested name/hash is not a committed output tuple", {
          state: "integrity-failed",
        });
      }
      if (typeof hooks.beforeOpen === "function") {
        await hooks.beforeOpen({ signal, binding: bound });
      }
      const opened = readVerifiedBytes(root, bound.executionId, expected, {
        signal,
        afterOpen: hooks.afterOpenFd,
      });
      assertClockSane({
        serverNow,
        createdAt: classified.record.createdAt,
        expiresAt: classified.record.expiresAt,
      });
      const again = classifyGet(await load(bound.executionId), bound, serverNow);
      if (again.state !== "available") {
        throw acquisitionRefuse(again.state || "integrity-failed", "access closed after bytes were opened", {
          state: again.state,
        });
      }
      return { metadata: expected, bytes: opened.bytes };
    } finally {
      release();
    }
  }

  const reader = {
    get,
    openVerified,
    sideEffects,
  };
  const writer = {
    publishCompleted,
    expire,
    admit,
  };

  return {
    reader,
    writer,
    admit,
    publishCompleted,
    expire,
    sideEffects,
    hooks,
    artifactRoot: root,
    maxAdmissions: cap,
    maxConcurrentReads: gate,
  };
}

export function createProcessLocalMissingSeam() {
  const map = new Map();
  return {
    kind: "process-local-missing-seam",
    publish(id, value) {
      map.set(id, value);
    },
    get(id) {
      const row = map.get(id);
      return row || { state: "not-found" };
    },
    restart() {
      map.clear();
    },
  };
}

export {
  hashReceiptProjection,
  sameAdmissionIdentity,
  FROZEN_REQUEST_HASH_VERSION,
  REQUEST_HASH_ALGORITHM,
};
