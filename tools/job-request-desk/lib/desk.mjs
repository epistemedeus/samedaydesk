import { existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  MAX_INPUT_BYTES,
  SCHEMA_VERSION,
  TICKET_SCHEMA,
  enginePin,
} from "./pins.mjs";
import { getJob, keyToFlag, optionalKeys, requiredKeys } from "./catalog.mjs";
import { fileDigest, sha256File, statBytes } from "./digest.mjs";
import { ensureUsefulJobsKit, runEngineJob } from "./engine.mjs";
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

function listOutputs(job, outDir) {
  return job.outputs
    .map((name) => {
      const path = join(outDir, name);
      if (!existsSync(path)) return null;
      return fileDigest(name, path);
    })
    .filter(Boolean)
    .map((row) => ({
      name: row.name,
      path: row.path,
      bytes: row.bytes,
      sha256: row.sha256,
    }));
}

function finalizeSampleOrCompleted(ticket, { sample, sampleReasons, outputs, engine, at }) {
  ticket.sample = Boolean(sample);
  ticket.sampleReasons = sampleReasons || [];
  ticket.outputs = outputs;
  ticket.engine = engine
    ? { ok: engine.json?.ok !== false, status: engine.json?.status || null, digest: engine.json?.digest || null }
    : null;
  Object.assign(ticket, saleFields());
  if (ticket.sample) {
    pushHistory(ticket, "sample", at);
  } else {
    pushHistory(ticket, "completed", at);
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
        return { ok: true, ...existing };
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
        ...saleFields(),
      };
      if (!existing) stamp(ticket, "queued");
      persist(ticket);

      if (request.defer === true) {
        return { ok: true, ...ticket };
      }

      if (sampleInfo.sample && wantsLiveSale(request)) {
        return rejectionEnvelope({
          code: "sample-not-a-sale",
          message: "SAMPLE / --example cannot become a sale",
          engineId,
          requestId: ticket.requestId,
        });
      }

      stamp(ticket, "running");
      persist(ticket);

      const outDir = request.outDir ? resolve(String(request.outDir)) : store.resultDir(identity.requestId);
      mkdirSync(outDir, { recursive: true });

      const engine = engineRunner(engineId, {
        files: materialized.files,
        example: materialized.example,
        outDir,
      });

      if (engine.status !== 0 || !engine.json || engine.json.ok === false) {
        ticket.engine = {
          ok: false,
          code: engine.json?.code || "engine-refused",
          error: engine.json?.error || engine.stderr || "engine refused",
        };
        Object.assign(ticket, saleFields());
        stamp(ticket, "rejected");
        persist(ticket);
        return {
          ok: false,
          refused: true,
          code: ticket.engine.code,
          error: ticket.engine.error,
          ...ticket,
        };
      }

      const outputs = listOutputs(job, outDir);
      ticket.resultUri = `file://${outDir}`;
      finalizeSampleOrCompleted(ticket, {
        sample: sampleInfo.sample || materialized.example,
        sampleReasons: sampleInfo.reasons,
        outputs,
        engine,
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
