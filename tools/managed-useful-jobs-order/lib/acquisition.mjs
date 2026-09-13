import {
  DEFAULT_MAX_ADMISSIONS,
  DEFAULT_MAX_CONCURRENT_READS,
  DEFAULT_OPEN_TIMEOUT_MS,
  DEFAULT_TTL_SECONDS,
  FROZEN_REQUEST_HASH_VERSION,
  HA1_JOB_IDS,
  REQUEST_HASH_ALGORITHM,
} from "./acquisition-constants.mjs";
import { AcquisitionRefuse, acquisitionRefuse } from "./acquisition-errors.mjs";
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

export const FORBIDDEN_SEAM_NAMES = Object.freeze([
  "runCreateOrder",
  "runPaidOffer",
  "settlePayment",
  "deliverOnce",
  "enqueue",
  "acknowledge",
  "engineStarts",
]);

export function createForbiddenSeamSpies() {
  const calls = Object.fromEntries(FORBIDDEN_SEAM_NAMES.map((name) => [name, 0]));
  const spies = {};
  for (const name of FORBIDDEN_SEAM_NAMES) {
    spies[name] = () => {
      calls[name] += 1;
      throw new Error(`forbidden seam ${name} invoked`);
    };
  }
  return { calls, spies };
}

function abortError(signal) {
  const reason = signal?.reason;
  if (reason instanceof AcquisitionRefuse) return reason;
  return acquisitionRefuse("aborted", "artifact open aborted; handle released");
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw abortError(signal);
}

export function createReadGate(max) {
  let active = 0;
  const waiters = [];

  function makeRelease() {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const next = waiters.shift();
      if (next) next.grant();
      else active -= 1;
    };
  }

  return {
    get active() {
      return active;
    },
    get queued() {
      return waiters.length;
    },
    get max() {
      return max;
    },
    async acquire(signal) {
      throwIfAborted(signal);
      if (active < max) {
        active += 1;
        return { release: makeRelease(), waited: false };
      }
      await new Promise((resolve, reject) => {
        let settled = false;
        const entry = {
          grant() {
            if (settled) return;
            settled = true;
            cleanup();
            resolve();
          },
        };
        const onAbort = () => {
          if (settled) return;
          settled = true;
          const idx = waiters.indexOf(entry);
          if (idx >= 0) waiters.splice(idx, 1);
          cleanup();
          reject(abortError(signal));
        };
        function cleanup() {
          signal?.removeEventListener?.("abort", onAbort);
        }
        waiters.push(entry);
        if (signal?.aborted) {
          onAbort();
          return;
        }
        signal?.addEventListener?.("abort", onAbort, { once: true });
      });
      if (signal?.aborted) {
        makeRelease()();
        throw abortError(signal);
      }
      return { release: makeRelease(), waited: true };
    },
  };
}

export function createOpenDeadline(timeoutMs, externalSignal) {
  const ac = new AbortController();
  let timer = null;
  let cleaned = false;
  const onExternal = () => {
    if (!ac.signal.aborted) ac.abort(externalSignal.reason);
  };
  if (externalSignal) {
    if (externalSignal.aborted) ac.abort(externalSignal.reason);
    else externalSignal.addEventListener("abort", onExternal, { once: true });
  }
  if (!ac.signal.aborted) {
    timer = setTimeout(() => {
      if (!ac.signal.aborted) {
        ac.abort(
          acquisitionRefuse("timeout", `artifact open exceeded the ${timeoutMs}-millisecond bound`, {
            detail: { timeoutMs },
          }),
        );
      }
    }, timeoutMs);
  }
  return {
    signal: ac.signal,
    dispose() {
      if (cleaned) return;
      cleaned = true;
      if (timer != null) clearTimeout(timer);
      timer = null;
      externalSignal?.removeEventListener?.("abort", onExternal);
    },
  };
}

async function raceAbort(work, signal) {
  throwIfAborted(signal);
  let onAbort;
  try {
    return await Promise.race([
      Promise.resolve(work),
      new Promise((_, reject) => {
        onAbort = () => reject(abortError(signal));
        if (signal.aborted) {
          onAbort();
          return;
        }
        signal.addEventListener("abort", onAbort, { once: true });
      }),
    ]);
  } finally {
    if (onAbort) signal.removeEventListener("abort", onAbort);
  }
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
  clock = null,
  forbiddenSeams = null,
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
  const readCap =
    Number.isSafeInteger(maxConcurrentReads) && maxConcurrentReads > 0
      ? maxConcurrentReads
      : DEFAULT_MAX_CONCURRENT_READS;
  const gate = createReadGate(readCap);
  const timeoutMs =
    Number.isSafeInteger(openTimeoutMs) && openTimeoutMs > 0 ? openTimeoutMs : DEFAULT_OPEN_TIMEOUT_MS;
  const hooks = {
    afterOpenFd: null,
    beforeOpen: null,
    betweenLstatAndOpen: null,
  };
  const seamSpies = forbiddenSeams && typeof forbiddenSeams === "object" ? forbiddenSeams : null;

  function sampleClock(serverNow, extra, waited) {
    const fn = extra?.clock || clock;
    if (typeof fn === "function") {
      return parseServerClock(fn(), "serverNow").iso;
    }
    if (waited) {
      throw acquisitionRefuse(
        "uncertain-clock",
        "open waited on the read gate; a frozen serverNow is not a fresh trusted clock. Inject clock() at the service boundary and re-sample after the wait.",
      );
    }
    return parseServerClock(serverNow, "serverNow").iso;
  }

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
    const operationTimeoutMs =
      Number.isSafeInteger(extra.openTimeoutMs) && extra.openTimeoutMs > 0 ? extra.openTimeoutMs : timeoutMs;
    const deadline = createOpenDeadline(operationTimeoutMs, extra.signal);
    let release = null;
    try {
      throwIfAborted(deadline.signal);
      const acquired = await gate.acquire(deadline.signal);
      release = acquired.release;
      throwIfAborted(deadline.signal);
      const now = sampleClock(serverNow, extra, acquired.waited);
      const record = await raceAbort(load(bound.executionId), deadline.signal);
      const classified = classifyGet(record, bound, now);
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
        await raceAbort(hooks.beforeOpen({ signal: deadline.signal, binding: bound }), deadline.signal);
      }
      throwIfAborted(deadline.signal);
      const opened = readVerifiedBytes(root, bound.executionId, expected, {
        signal: deadline.signal,
        afterOpen: hooks.afterOpenFd,
        betweenLstatAndOpen: hooks.betweenLstatAndOpen,
      });
      const nowAfter = sampleClock(serverNow, extra, acquired.waited);
      assertClockSane({
        serverNow: nowAfter,
        createdAt: classified.record.createdAt,
        expiresAt: classified.record.expiresAt,
      });
      const again = classifyGet(await raceAbort(load(bound.executionId), deadline.signal), bound, nowAfter);
      if (again.state !== "available") {
        throw acquisitionRefuse(again.state || "integrity-failed", "access closed after bytes were opened", {
          state: again.state,
        });
      }
      return { metadata: expected, bytes: opened.bytes };
    } finally {
      deadline.dispose();
      if (release) release();
    }
  }

  const reader = {
    get,
    openVerified,
    forbiddenSeams: seamSpies,
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
    hooks,
    artifactRoot: root,
    maxAdmissions: cap,
    maxConcurrentReads: gate,
    forbiddenSeams: seamSpies,
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
