/**
 * HA2 authenticated retrieval adapter over an injected HA1 reader.
 * No SQL, no auth-provider implementation, no payment rail, no execution.
 */
import { EXECUTION_CONTRACT_VERSION } from "./contract.mjs";
import { FROZEN_REQUEST_HASH_VERSION } from "../../../tools/managed-useful-jobs-order/lib/acquisition-constants.mjs";
import { AcquisitionRefuse } from "../../../tools/managed-useful-jobs-order/lib/acquisition-errors.mjs";
import { hashPublicationIdentityV1 } from "../../../tools/managed-useful-jobs-order/lib/acquisition-identity.mjs";

const ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const PRIVATE_HEADERS = {
  "cache-control": "private, no-store",
  "x-content-type-options": "nosniff",
  "x-acquisition": "ha2",
};

function header(req, name) {
  const raw = req?.headers?.[name] ?? req?.headers?.[name.toLowerCase()];
  if (raw == null) return null;
  return String(Array.isArray(raw) ? raw[0] : raw).trim() || null;
}

function extractBearerToken(req) {
  const raw = header(req, "authorization");
  if (!raw) return null;
  const bearer = /^Bearer\s+(\S+)$/i.exec(raw);
  return bearer ? bearer[1] : null;
}

/**
 * Trusted adapter: maps a presented bearer token to a stable principal ID.
 * Raw Authorization strings are not principals.
 */
export function createStaticPrincipalAdapter(tokenToPrincipal) {
  const map =
    tokenToPrincipal instanceof Map ? tokenToPrincipal : new Map(Object.entries(tokenToPrincipal || {}));
  return async function resolvePrincipal(req) {
    const token = extractBearerToken(req);
    if (!token) return null;
    return map.get(token) || null;
  };
}

/**
 * Bounds live HTTP responses (including paused sockets) independently of the
 * HA1 file-read gate. Held from admission through finish/close.
 */
export function createResponseSemaphore({ max = 8, timeoutMs = 30_000 } = {}) {
  const cap = Number.isSafeInteger(max) && max > 0 ? max : 8;
  const limitMs = Number.isSafeInteger(timeoutMs) && timeoutMs > 0 ? timeoutMs : 30_000;
  let active = 0;

  return {
    get active() {
      return active;
    },
    get max() {
      return cap;
    },
    get timeoutMs() {
      return limitMs;
    },
    tryAcquire(req, res) {
      if (active >= cap) return null;
      active += 1;
      let released = false;
      const release = () => {
        if (released) return;
        released = true;
        active -= 1;
        if (timer != null) clearTimeout(timer);
        try {
          req?.socket?.setTimeout?.(0);
        } catch {
          /* already closed */
        }
      };
      const timer = setTimeout(() => {
        try {
          if (!res.writableEnded && !res.destroyed) res.destroy();
        } catch {
          /* already closed */
        }
        release();
      }, limitMs);
      try {
        req?.socket?.setNoDelay?.(true);
      } catch {
        /* no socket yet */
      }
      res.once("finish", release);
      res.once("close", release);
      return { release };
    },
  };
}

export function utcClock() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

function jsonHeaders(extra = {}) {
  return {
    "content-type": "application/json",
    ...PRIVATE_HEADERS,
    ...extra,
  };
}

function endJson(res, status, body) {
  if (res.destroyed || res.writableEnded) return;
  const text = JSON.stringify(body);
  res.writeHead(status, {
    ...jsonHeaders(),
    "content-length": Buffer.byteLength(text),
  });
  res.end(text);
}

function errorBody(code, message, extra = {}) {
  return {
    ok: false,
    code,
    error: message,
    contract: EXECUTION_CONTRACT_VERSION,
    purchaseAuthority: false,
    sold: false,
    ...extra,
  };
}

function mapStatus(err) {
  if (!(err instanceof AcquisitionRefuse) && err?.code) {
    const table = {
      "not-found": 404,
      pending: 202,
      "identity-conflict": 409,
      expired: 410,
      "integrity-failed": 422,
      oversize: 413,
      timeout: 504,
      aborted: 499,
      "capacity-exhausted": 503,
      "store-unavailable": 503,
      "uncertain-clock": 503,
      "invalid-name": 400,
      "invalid-binding": 400,
      "hostile-path": 400,
      "untrusted-principal": 401,
    };
    return err.httpStatus || table[err.code] || 500;
  }
  if (err instanceof AcquisitionRefuse) {
    return err.httpStatus || 500;
  }
  return 500;
}

function parseRawPath(url) {
  const raw = String(url || "/");
  const cut = raw.search(/[?#]/);
  const path = cut >= 0 ? raw.slice(0, cut) : raw;
  if (raw.includes("\\") || path.includes("//")) {
    throw Object.assign(new Error("malformed acquisition path"), { code: "invalid-name", httpStatus: 400 });
  }
  const parts = path.split("/");
  if (parts[0] !== "" || parts[1] !== "results" || parts.length < 3 || parts.length > 5) {
    return { kind: "other" };
  }
  const executionId = parts[2];
  if (!ID.test(executionId) || executionId.includes("%")) {
    throw Object.assign(new Error("invalid execution id"), { code: "invalid-execution-id", httpStatus: 400 });
  }
  if (parts.length === 3) return { kind: "metadata", executionId };
  if (parts.length === 5 && parts[3] === "artifacts") {
    const name = parts[4];
    if (
      name.includes("%") ||
      name.includes("..") ||
      name.includes("\\") ||
      name.includes("\0") ||
      name === "." ||
      name === ""
    ) {
      throw Object.assign(new Error("invalid artifact name"), { code: "invalid-name", httpStatus: 400 });
    }
    return { kind: "artifact", executionId, name };
  }
  return { kind: "other" };
}

function pendingCount(gate) {
  if (!gate) return 0;
  return Number(gate.active || 0) + Number(gate.queued || 0);
}

async function writeWithBackpressure(res, bytes, { signal, chunkSize = 16 * 1024 } = {}) {
  if (res.destroyed || res.writableEnded) return;
  let offset = 0;
  const chunk = Number.isSafeInteger(chunkSize) && chunkSize > 0 ? chunkSize : 16 * 1024;
  while (offset < bytes.length) {
    if (signal?.aborted || res.destroyed) {
      if (!res.destroyed) {
        try {
          res.destroy();
        } catch {
          /* already closed */
        }
      }
      return;
    }
    const next = Math.min(offset + chunk, bytes.length);
    const slice = bytes.subarray(offset, next);
    offset = next;
    const ok = res.write(slice);
    if (!ok) {
      await new Promise((resolve) => {
        const done = () => {
          res.off("drain", done);
          res.off("close", done);
          signal?.removeEventListener?.("abort", done);
          resolve();
        };
        res.once("drain", done);
        res.once("close", done);
        if (signal) {
          if (signal.aborted) {
            done();
            return;
          }
          signal.addEventListener("abort", done, { once: true });
        }
      });
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  if (!res.destroyed && !res.writableEnded) res.end();
}

export function createAcquisitionHttpHandler({
  reader,
  resolvePrincipal,
  clock = utcClock,
  forbiddenSeams = null,
  gate = null,
  maxPendingDownloads = null,
  maxActiveResponses = null,
  responseTimeoutMs = 30_000,
  requestHashVersion = FROZEN_REQUEST_HASH_VERSION,
  openTimeoutMs = 30_000,
} = {}) {
  if (!reader || typeof reader.get !== "function" || typeof reader.openVerified !== "function") {
    throw new Error("HA2 requires an injected HA1 AcquisitionReader");
  }
  if (typeof resolvePrincipal !== "function") {
    throw new Error("HA2 requires an injected trusted principal adapter");
  }
  const pendingCap =
    Number.isSafeInteger(maxPendingDownloads) && maxPendingDownloads > 0
      ? maxPendingDownloads
      : gate?.max
        ? gate.max + (gate.maxQueued || 0)
        : null;
  const responseMax =
    Number.isSafeInteger(maxActiveResponses) && maxActiveResponses > 0
      ? maxActiveResponses
      : pendingCap || 8;
  const responses = createResponseSemaphore({ max: responseMax, timeoutMs: responseTimeoutMs });

  async function handleAcquisition(req, res) {
    let parsed;
    try {
      parsed = parseRawPath(req.url || "/");
    } catch (err) {
      endJson(res, err.httpStatus || 400, errorBody(err.code || "invalid-binding", err.message));
      return true;
    }
    if (parsed.kind === "other") return false;
    if (parsed.kind === "metadata" && !header(req, "x-request-sha256")) return false;
    if (req.method !== "GET") {
      endJson(res, 405, errorBody("method-not-allowed", "Acquisition routes are GET only"));
      return true;
    }
    if (header(req, "range")) {
      if (!res.destroyed && !res.writableEnded) {
        res.writeHead(416, {
          ...PRIVATE_HEADERS,
          "content-type": "application/json",
          "accept-ranges": "none",
        });
        res.end(JSON.stringify(errorBody("range-not-supported", "Range requests are not supported")));
      }
      return true;
    }

    const principalId = await Promise.resolve(resolvePrincipal(req));
    if (!principalId) {
      endJson(res, 404, errorBody("not-found", "Execution not found"));
      return true;
    }
    const requestHash = (header(req, "x-request-sha256") || "").toLowerCase();
    if (!SHA256.test(requestHash)) {
      endJson(res, 400, errorBody("invalid-binding", "X-Request-SHA256 must be 64 lowercase hex"));
      return true;
    }
    const presentedVersion = header(req, "x-request-hash-version");
    if (!presentedVersion) {
      endJson(res, 400, errorBody("invalid-binding", "X-Request-Hash-Version is required"));
      return true;
    }
    if (presentedVersion !== requestHashVersion) {
      endJson(
        res,
        409,
        errorBody("identity-conflict", "request hash version does not match the acquisition binding", {
          state: "identity-conflict",
        }),
      );
      return true;
    }

    if (pendingCap != null && pendingCount(gate) >= pendingCap) {
      endJson(res, 503, errorBody("capacity-exhausted", "pending download count is at the configured bound"));
      return true;
    }
    const held = responses.tryAcquire(req, res);
    if (!held) {
      endJson(res, 503, errorBody("capacity-exhausted", "active HTTP response count is at the configured bound"));
      return true;
    }

    const ac = new AbortController();
    const onAbort = () => {
      if (!ac.signal.aborted) ac.abort();
    };
    req.on("aborted", onAbort);
    res.on("close", () => {
      if (!res.writableEnded && !res.destroyed) onAbort();
    });

    const binding = { principalId, executionId: parsed.executionId, requestHash };
    const now = typeof clock === "function" ? clock() : clock;

    try {
      if (parsed.kind === "metadata") {
        const result = await reader.get(binding, now, { clock, signal: ac.signal });
        if (result.state === "available") {
          const publicationIdentitySha256 = hashPublicationIdentityV1({
            executionId: result.executionId,
            jobId: result.jobId,
            requestHash: result.requestHash,
            requestHashVersion,
            receiptSha256: result.receiptSha256,
            outputsDigest: result.outputsDigest,
            outputs: result.outputs,
          });
          endJson(res, 200, {
            ok: true,
            state: "available",
            contract: EXECUTION_CONTRACT_VERSION,
            principalId: result.principalId,
            executionId: result.executionId,
            requestHash: result.requestHash,
            requestHashVersion,
            jobId: result.jobId,
            receiptSha256: result.receiptSha256,
            outputsDigest: result.outputsDigest,
            outputs: result.outputs,
            publicationIdentitySha256,
            termsVersion: result.termsVersion,
            sample: result.sample,
            expiresAt: result.expiresAt,
            purchaseAuthority: false,
            sold: false,
            retrieval: {
              id: result.executionId,
              path: `/results/${encodeURIComponent(result.executionId)}`,
              artifactsPath: `/results/${encodeURIComponent(result.executionId)}/artifacts/`,
            },
          });
          return true;
        }
        const status = {
          pending: 202,
          "not-found": 404,
          "identity-conflict": 409,
          expired: 410,
          "integrity-failed": 422,
        }[result.state] || 500;
        endJson(res, status, errorBody(result.state, `retrieval is ${result.state}`, { state: result.state }));
        return true;
      }

      const artifactHash = (header(req, "x-artifact-sha256") || "").toLowerCase();
      if (!SHA256.test(artifactHash)) {
        endJson(res, 400, errorBody("invalid-binding", "X-Artifact-SHA256 must be 64 lowercase hex"));
        return true;
      }
      const opened = await reader.openVerified(
        { ...binding, name: parsed.name, sha256: artifactHash },
        now,
        { clock, signal: ac.signal, openTimeoutMs },
      );
      if (res.destroyed || res.writableEnded) return true;
      const bytes = Buffer.from(opened.bytes);
      res.writeHead(200, {
        "content-type": "application/octet-stream",
        "content-length": bytes.length,
        "content-disposition": `attachment; filename="${opened.metadata.name}"`,
        "accept-ranges": "none",
        ...PRIVATE_HEADERS,
      });
      await writeWithBackpressure(res, bytes, { signal: ac.signal });
      return true;
    } catch (err) {
      if (forbiddenSeams && typeof forbiddenSeams === "object") {
        /* GET must not have invoked these; tests assert call counts. */
      }
      const status = mapStatus(err);
      const code = err?.code || "internal-error";
      if (code === "aborted" || req.aborted) {
        if (!res.writableEnded && !res.destroyed) {
          try {
            res.destroy();
          } catch {
            /* already closed */
          }
        }
        return true;
      }
      endJson(res, status, errorBody(code, err.message || "acquisition failed", { state: err.state || null }));
      return true;
    } finally {
      req.off?.("aborted", onAbort);
    }
  }
  handleAcquisition.responseSemaphore = responses;
  return handleAcquisition;
}
