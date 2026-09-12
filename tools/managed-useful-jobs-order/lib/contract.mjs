import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { OrderRefuse } from "./errors.mjs";
import { allowedFlags, flagToKey, isFlag, isReferencedCaptureFlag, jobById, requiredFlags } from "./catalog.mjs";
import { assertSha256, normalizeSha256 } from "./digest.mjs";
import { MAX_INPUT_BYTES, USEFUL_JOBS_VERSION } from "./pins.mjs";

const ORDER_ID_RE = /^[A-Za-z0-9._-]{1,128}$/;
const FUNDING = new Set(["unfunded", "reserved-fixture", "rejected"]);

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

export function hasOrderId(raw) {
  if (!raw || typeof raw !== "object") return false;
  const value = raw.orderId;
  return !(value == null || value === "");
}

function asInt(value, label) {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(n) || n < 0) {
    throw new OrderRefuse("invalid-bytes", `${label} must be a non-negative integer`, {
      detail: { label, value },
    });
  }
  return n;
}

function resolveInputPath(pathValue, requestDir) {
  if (pathValue == null || pathValue === "") return null;
  const raw = String(pathValue);
  if (raw.startsWith("/")) return resolve(raw);
  const fromRequest = requestDir ? resolve(requestDir, raw) : null;
  if (fromRequest && existsSync(fromRequest)) return fromRequest;
  return resolve(process.cwd(), raw);
}

function normalizeOneInput(entry, requestDir) {
  if (!entry || typeof entry !== "object") {
    throw new OrderRefuse("invalid-input", "each input must be an object with flag, path, sha256, bytes");
  }
  let flag = entry.flag || (entry.key ? `--${flagToKey(entry.key)}` : null);
  if (flag && !String(flag).startsWith("--")) flag = `--${flag}`;
  if (!isFlag(flag)) {
    throw new OrderRefuse("invalid-input-flag", `input flag is not a catalog flag: ${flag}`);
  }
  const pathValue = entry.path;
  const resolvedPath = resolveInputPath(pathValue, requestDir);
  if (!resolvedPath) {
    throw new OrderRefuse("missing-input-path", `input ${flag} is missing path (local runner needs caller files)`, {
      detail: { flag },
    });
  }
  const key = flagToKey(flag);
  if (entry.kind === "directory" || key === "input-root") {
    return {
      flag,
      key,
      path: String(pathValue),
      resolvedPath,
      kind: "directory",
      sha256: null,
      bytes: null,
    };
  }
  const sha256 = normalizeSha256(entry.sha256);
  if (!sha256) {
    throw new OrderRefuse("missing-input-digest", `input ${flag} must include buyer sha256`, {
      falsifier: "F-INPUT",
      detail: { flag },
    });
  }
  const bytes = asInt(entry.bytes, `${flag} bytes`);
  if (bytes > MAX_INPUT_BYTES) {
    throw new OrderRefuse("input-too-large", `input ${flag} exceeds ${MAX_INPUT_BYTES} bytes`, {
      detail: { flag, bytes },
    });
  }
  return { flag, key, path: String(pathValue), resolvedPath, sha256, bytes };
}

function normalizeInputs(raw, requestDir) {
  if (Array.isArray(raw.inputs)) {
    return raw.inputs.map((entry) => normalizeOneInput(entry, requestDir));
  }
  if (raw.inputs && typeof raw.inputs === "object") {
    return Object.entries(raw.inputs).map(([key, spec]) => {
      const body = spec && typeof spec === "object" ? spec : {};
      return normalizeOneInput({ flag: key.startsWith("--") ? key : `--${key}`, ...body }, requestDir);
    });
  }
  throw new OrderRefuse("missing-inputs", "request.inputs is required", { falsifier: "F-INPUT" });
}

export function normalizeRequest(raw, { catalog, pins, requestDir = null } = {}) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new OrderRefuse("invalid-request", "request must be a JSON object");
  }

  const orderId = raw.orderId;
  if (!hasOrderId(raw)) {
    throw new OrderRefuse("order-id-omitted", "payable order MUST include immutable orderId", {
      falsifier: "F-ORDER",
    });
  }
  if (typeof orderId !== "string" || !ORDER_ID_RE.test(orderId)) {
    throw new OrderRefuse("invalid-order-id", "orderId must be 1-128 characters [A-Za-z0-9._-]", {
      falsifier: "F-ORDER",
      detail: { orderId },
    });
  }

  const engineId = raw.engineId;
  if (!engineId || typeof engineId !== "string") {
    throw new OrderRefuse("missing-engine-id", "payable order MUST include engineId");
  }
  const job = jobById(catalog, engineId);
  if (!job) {
    throw new OrderRefuse("unknown-engine", `engineId is not a useful-jobs catalog id: ${engineId}`, {
      detail: { engineId, allowed: catalog.jobs.map((j) => j.id) },
    });
  }

  const pinSrc = raw.enginePin && typeof raw.enginePin === "object" ? raw.enginePin : {};
  const sha256 = normalizeSha256(pinSrc.sha256 || raw.archiveSha256);
  if (!sha256) {
    throw new OrderRefuse("missing-engine-pin", "payable order MUST include enginePin.sha256 / archiveSha256", {
      falsifier: "F-PIN",
    });
  }
  const bytesRaw = pinSrc.bytes ?? raw.archiveBytes;
  if (bytesRaw == null) {
    throw new OrderRefuse("missing-engine-pin", "payable order MUST include enginePin.bytes / archiveBytes", {
      falsifier: "F-PIN",
    });
  }
  const bytes = asInt(bytesRaw, "archiveBytes");
  const version = String(pinSrc.version || raw.engineVersion || pins.version || USEFUL_JOBS_VERSION);
  const pkg =
    typeof pinSrc.package === "string" && pinSrc.package
      ? pinSrc.package
      : pins.package;

  const inputs = normalizeInputs(raw, requestDir);
  const allowed = new Set(allowedFlags(job));
  for (const inp of inputs) {
    if (allowed.has(inp.flag) || isReferencedCaptureFlag(inp.flag)) continue;
    throw new OrderRefuse("unexpected-input-flag", `flag ${inp.flag} is not in the catalog contract for ${engineId}`, {
      detail: { flag: inp.flag, allowed: [...allowed] },
    });
  }
  const missing = requiredFlags(job).filter((flag) => !inputs.some((inp) => inp.flag === flag));
  if (missing.length) {
    throw new OrderRefuse("missing-required-inputs", `missing required flags ${missing.join(", ")}`, {
      falsifier: "F-INPUT",
      detail: { missing },
    });
  }

  let fundingState = raw.fundingState ?? "unfunded";
  if (!FUNDING.has(fundingState)) {
    throw new OrderRefuse("invalid-funding-state", "fundingState must be unfunded|reserved-fixture|rejected", {
      detail: { fundingState },
    });
  }

  return {
    engineId,
    orderId,
    example: raw.example === true || raw.example === "true",
    sold: raw.sold === true,
    charged: raw.charged === true,
    purchaseAuthority: raw.purchaseAuthority === true,
    schedulerDaemon: raw.schedulerDaemon === true,
    fundingState,
    enginePin: { sha256, bytes, version, package: pkg },
    archiveSha256: sha256,
    archiveBytes: bytes,
    inputs,
    outputs: [...(job.outputs || [])],
    job,
  };
}

export function requestDirFromFile(requestPath) {
  return dirname(resolve(requestPath));
}

export { assertSha256 };
