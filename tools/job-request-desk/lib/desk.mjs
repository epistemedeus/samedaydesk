import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  MAX_INPUT_BYTES,
  SCHEMA_VERSION,
  SDS52_PIN,
  TICKET_SCHEMA,
  enginePin,
} from "./pins.mjs";
import { getJob, keyToFlag, optionalKeys, requiredKeys } from "./catalog.mjs";
import { fileDigest, sha256File, statBytes } from "./digest.mjs";
import { ensureUsefulJobsKit, runEngineJob } from "./engine.mjs";
import { classifyExecution, isReplayFailure } from "./outcomes.mjs";
import { DeskRefuse, refuse, rejectionEnvelope } from "./refuse.mjs";
import { inspectSample, wantsLiveSale } from "./sample-guard.mjs";
import { createJsonStore } from "./store.mjs";
import { identityFromTerms } from "./terms.mjs";

function nowIso(clock) {
  if (typeof clock === "function") return clock();
  if (clock) return clock;
  return new Date().toISOString();
}

function inputValuePath(value) {
  if (value == null || value === false || value === "") return null;
  if (typeof value === "string") return value;
  if (typeof value === "object" && typeof value.path === "string") return value.path;
  return null;
}

function declaredSha256(value) {
  if (value && typeof value === "object" && typeof value.sha256 === "string") return value.sha256;
  return null;
}

function materializeInputs(job, request) {
  const example = request?.example === true || request?.example === "true";
  const raw = request?.inputs && typeof request.inputs === "object" ? { ...request.inputs } : {};
  const reqKeys = requiredKeys(job);
  const allowed = new Set([...reqKeys, ...optionalKeys(job)]);

  if (!example) {
    const missing = reqKeys.filter((k) => inputValuePath(raw[k]) == null);
    if (missing.length) {
      throw refuse(
        "missing-required-inputs",
        `Caller mode requires ${job.requiredInputs.join(", ")}; use --example only for labeled SAMPLE runs (not a sale)`,
        { missing, required: reqKeys },
      );
    }
  }

  const files = {};
  const entries = [];

  for (const [key, value] of Object.entries(raw)) {
    if (!allowed.has(key)) continue;
    const filePath = inputValuePath(value);
    if (!filePath) continue;
    const abs = resolve(filePath);
    if (!existsSync(abs)) {
      throw refuse("input-missing-file", `Input ${key} file not found: ${abs}`, { key, path: abs });
    }
    const bytes = statBytes(abs);
    if (bytes > MAX_INPUT_BYTES) {
      throw refuse("input-oversize", `Input ${key} is ${bytes} bytes; max is ${MAX_INPUT_BYTES}`, {
        key,
        bytes,
        max: MAX_INPUT_BYTES,
      });
    }
    const sha256 = sha256File(abs);
    const declared = declaredSha256(value);
    if (declared && declared !== sha256) {
      throw refuse("digest-mismatch", `Input ${key} sha256 does not match file bytes`, {
        key,
        declared,
        computed: sha256,
      });
    }
    files[key] = abs;
    entries.push({
      flag: keyToFlag(key),
      name: key,
      path: abs,
      bytes,
      sha256,
    });
  }

  entries.sort((a, b) => a.flag.localeCompare(b.flag));
  return { example, files, entries };
}

function pushHistory(ticket, status, at) {
  ticket.statusHistory = ticket.statusHistory || [];
  ticket.statusHistory.push({ status, at });
  ticket.status = status;
  ticket.updatedAt = at;
}

function saleFields() {
  return {
    sold: false,
    purchaseAuthority: false,
    fundingState: "unfunded",
    liveSettleAllowed: false,
    liveSettleAttempted: false,
  };
}

function isCatalogBasename(name) {
  return typeof name === "string" && /^[A-Za-z0-9._-]+$/.test(name);
}

function resetCatalogOutputs(dir, outputNames) {
  mkdirSync(dir, { recursive: true });
  for (const name of outputNames) {
    if (!isCatalogBasename(name)) {
      throw refuse("store-path-escape", "output name is not a catalog basename", { name });
    }
    const path = join(dir, name);
    if (existsSync(path)) rmSync(path, { force: true });
  }
}

function presentCatalogOutputs(job, outDir) {
  const present = [];
  const outputs = [];
  for (const name of job.outputs) {
    if (!isCatalogBasename(name)) continue;
    const path = join(outDir, name);
    if (!existsSync(path)) continue;
    present.push(name);
    outputs.push(fileDigest(name, path));
  }
  return { present, outputs };
}

function replayEnvelope(existing) {
  if (isReplayFailure(existing)) {
    return {
      ...existing,
      ok: false,
      refused: true,
      replay: true,
      code: existing.engine?.code || existing.code || "rejected-replay",
      error: existing.engine?.error || existing.error || "rejected request remains rejected on replay",
    };
  }
  return { ...existing, ok: true, replay: true };
}

function finalizeDelivered(ticket, { sample, sampleReasons, outputs, engine, classified, wrapper, at }) {
  ticket.sample = Boolean(sample);
  ticket.sampleReasons = sampleReasons || [];
  ticket.outputs = outputs;
  ticket.outcomeKind = classified.outcomeKind;
  ticket.analysisOutcome = classified.analysisOutcome;
  ticket.executionOk = true;
  ticket.engine = engine
    ? {
        ok: engine.json?.ok !== false,
        status: engine.json?.status || classified.analysisOutcome || null,
        digest: engine.json?.digest || null,
        pin: engine.pin || SDS52_PIN,
      }
    : { ok: true, status: classified.analysisOutcome, digest: null, pin: SDS52_PIN };
  if (wrapper?.receipt) ticket.sds52Receipt = wrapper.receipt;
  Object.assign(ticket, saleFields());
  if (ticket.sample) {
    pushHistory(ticket, "sample", at);
  } else {
    pushHistory(ticket, classified.ticketStatus, at);
  }
  return ticket;
}

export function createDesk({ store, engineRunner = runEngineJob, clock } = {}) {
  if (!store) throw refuse("missing-store", "store is required");

  function stamp(ticket, status) {
    pushHistory(ticket, status, nowIso(clock));
  }

  function persist(ticket) {
    return store.write(ticket);
  }

  function createRequest(request = {}) {
    const engineId = request.engineId || request.jobId;
    if (!engineId) {
      return rejectionEnvelope({ code: "missing-job", message: "engineId is required" });
    }

    let job;
    try {
      job = getJob(engineId);
    } catch (err) {
      if (err instanceof DeskRefuse) {
        return rejectionEnvelope({ code: err.code, message: err.message, detail: err.detail, engineId });
      }
      throw err;
    }

    if (request.enginePin) {
      const pin = enginePin();
      const declaredSha = request.enginePin.sha256;
      const declaredBytes = request.enginePin.bytes;
      const declaredVersion = request.enginePin.version;
      if (
        (declaredSha && declaredSha !== pin.sha256) ||
        (declaredBytes != null && Number(declaredBytes) !== pin.bytes) ||
        (declaredVersion && declaredVersion !== pin.version)
      ) {
        return rejectionEnvelope({
          code: "engine-pin-mismatch",
          message: "declared enginePin does not match the published useful-jobs 1.0.0 archive",
          detail: { declared: request.enginePin, expected: pin },
          engineId,
        });
      }
    }

    try {
      if (wantsLiveSale(request)) {
        return rejectionEnvelope({
          code: "live-settle-out-of-scope",
          message: "Live sale is not available from this non-settling ticket desk",
          engineId,
        });
      }

      const kit = ensureUsefulJobsKit();
      const sampleInfo = inspectSample(request, { kitRoot: kit });
      const materialized = materializeInputs(job, request);

      const identity = identityFromTerms({
        engineId,
        inputs: materialized.example
          ? [{ flag: "--example", sha256: "example", bytes: 0 }]
          : materialized.entries,
        orderId: request.orderId || null,
        example: materialized.example,
        callerTermsVersion: request.termsVersion,
      });

      const existingByOrder = request.orderId ? store.findByOrderId(request.orderId) : null;
      if (existingByOrder && existingByOrder.requestId !== identity.requestId) {
        throw refuse("same-order-id-input-swap", "same orderId must not swap files; changed inputs need a new orderId", {
          orderId: request.orderId,
          existingRequestId: existingByOrder.requestId,
          computedRequestId: identity.requestId,
        });
      }

      const existing = store.read(identity.requestId);
      if (existing && existing.status !== "queued") {
        return replayEnvelope(existing);
      }

      const resultUri = store.resultUri(identity.requestId);
      const at = nowIso(clock);
      const ticket = existing || {
        schema: TICKET_SCHEMA,
        schemaVersion: SCHEMA_VERSION,
        requestId: identity.requestId,
        orderId: request.orderId || identity.requestId,
        engineId,
        enginePin: enginePin(),
        sds52Pin: SDS52_PIN,
        termsVersion: identity.termsVersion,
        terms: identity.terms,
        status: "queued",
        statusHistory: [],
        sample: sampleInfo.sample || materialized.example,
        sampleReasons: sampleInfo.reasons,
        inputs: materialized.entries,
        outputs: [],
        resultUri,
        archiveSha256: enginePin().sha256,
        createdAt: at,
        updatedAt: at,
        executionOk: null,
        outcomeKind: null,
        analysisOutcome: null,
        ...saleFields(),
      };
      if (!existing) stamp(ticket, "queued");
      persist(ticket);

      if (request.defer === true) {
        return { ok: true, ...ticket };
      }

      stamp(ticket, "running");
      persist(ticket);

      const outDir = store.resultDir(identity.requestId);
      resetCatalogOutputs(outDir, job.outputs);

      const engine = engineRunner(engineId, {
        files: materialized.files,
        example: materialized.example,
        outDir,
      });

      const listed = presentCatalogOutputs(job, outDir);
      const classified = classifyExecution({
        spawnStatus: engine.status,
        engineJson: engine.json,
        expectedNames: job.outputs,
        presentNames: listed.present,
      });

      ticket.sds52 = {
        pin: engine.pin || SDS52_PIN,
        invoked: engine.wrapper != null || engine.cli != null,
      };

      if (!classified.executionOk) {
        ticket.engine = {
          ok: false,
          code:
            classified.outcomeKind === "incomplete-outputs"
              ? "incomplete-outputs"
              : engine.json?.code || classified.outcomeKind || "engine-refused",
          error:
            classified.outcomeKind === "incomplete-outputs"
              ? `missing catalog outputs: ${classified.missing.join(", ")}`
              : engine.json?.error || engine.stderr || "engine refused",
        };
        ticket.outputs = [];
        ticket.outcomeKind = classified.outcomeKind;
        ticket.analysisOutcome = classified.analysisOutcome;
        ticket.executionOk = false;
        Object.assign(ticket, saleFields());
        stamp(ticket, "rejected");
        persist(ticket);
        return {
          ...ticket,
          ok: false,
          refused: true,
          code: ticket.engine.code,
          error: ticket.engine.error,
        };
      }

      ticket.resultUri = `file://${outDir}`;
      finalizeDelivered(ticket, {
        sample: sampleInfo.sample || materialized.example,
        sampleReasons: sampleInfo.reasons,
        outputs: listed.outputs,
        engine,
        classified,
        wrapper: engine.wrapper || null,
        at: nowIso(clock),
      });
      persist(ticket);
      return { ok: true, ...ticket };
    } catch (err) {
      if (err instanceof DeskRefuse) {
        return rejectionEnvelope({
          code: err.code,
          message: err.message,
          detail: err.detail,
          engineId,
        });
      }
      return rejectionEnvelope({
        code: "internal-error",
        message: err.message || String(err),
        engineId,
      });
    }
  }

  function getRequest(requestId) {
    try {
      const ticket = store.read(requestId);
      if (!ticket) {
        return rejectionEnvelope({
          code: "unknown-request",
          message: `no ticket ${requestId}`,
          requestId,
        });
      }
      return { ok: true, ...ticket };
    } catch (err) {
      if (err instanceof DeskRefuse) {
        return rejectionEnvelope({ code: err.code, message: err.message, detail: err.detail, requestId });
      }
      throw err;
    }
  }

  function listRequests({ engineId } = {}) {
    const tickets = store.list().filter((t) => (engineId ? t.engineId === engineId : true));
    return {
      ok: true,
      sold: false,
      purchaseAuthority: false,
      count: tickets.length,
      requests: tickets.map((t) => ({
        requestId: t.requestId,
        orderId: t.orderId,
        engineId: t.engineId,
        status: t.status,
        sold: false,
        sample: Boolean(t.sample),
        executionOk: t.executionOk,
        outcomeKind: t.outcomeKind || null,
        resultUri: t.resultUri,
        updatedAt: t.updatedAt,
      })),
    };
  }

  return { createRequest, getRequest, listRequests, store };
}

export function openDesk(storeDir, options = {}) {
  return createDesk({ store: createJsonStore(storeDir), ...options });
}
