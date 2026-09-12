import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { REQUEST_SCHEMA, MAX_INPUT_BYTES, F08_PIN_SHA, CURRENT_RUNTIME_PIN, FALLBACK_RUNNERS, KNOWN_RUNNERS } from "./pins.mjs";
import { getJob, requiredKeys } from "./catalog.mjs";
import { filesFromItem } from "./sample.mjs";
import { integerTermsVersionRejected } from "./terms.mjs";
import { confineExistingPath, isSafeItemId, looksJsonText } from "./confine.mjs";

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export class BatchRefuse extends Error {
  constructor(code, message, detail = {}) {
    super(message);
    this.name = "BatchRefuse";
    this.code = code;
    this.detail = detail;
  }
}

function resolveMaybePath(value, baseDir) {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed) return value;
  if (looksJsonText(trimmed)) return value;
  const abs = isAbsolute(trimmed) ? trimmed : resolve(baseDir, trimmed);
  return abs;
}

function loadPayment(item, baseDir) {
  if (isPlainObject(item.payment)) return item.payment;
  if (typeof item.payment === "string") {
    if (looksJsonText(item.payment)) {
      try {
        return JSON.parse(item.payment);
      } catch (err) {
        throw new BatchRefuse("payment-unreadable", `payment JSON is malformed: ${err.message}`);
      }
    }
    const path = resolveMaybePath(item.payment, baseDir);
    const confined = confineExistingPath(path);
    if (!confined.ok) {
      throw new BatchRefuse("traversing-item", "payment path escapes the repository input root", {
        path,
        resolved: confined.path,
      });
    }
    try {
      return JSON.parse(readFileSync(confined.path, "utf8"));
    } catch (err) {
      throw new BatchRefuse("payment-unreadable", err.message, { path: confined.path });
    }
  }
  return null;
}

function confineFiles(source, baseDir) {
  const files = {};
  for (const [key, value] of Object.entries(source)) {
    if (value == null || value === false || value === "") continue;
    if (typeof value !== "string") {
      files[key] = value;
      continue;
    }
    if (looksJsonText(value)) {
      files[key] = value;
      continue;
    }
    const abs = resolveMaybePath(value, baseDir);
    const confined = confineExistingPath(abs);
    if (!confined.ok) {
      throw new BatchRefuse("traversing-item", `Input ${key} escapes the repository input root`, {
        key,
        path: value,
        resolved: confined.path,
      });
    }
    files[key] = confined.path;
  }
  return files;
}

export function parseBatchRequest(raw, { baseDir = process.cwd() } = {}) {
  if (!isPlainObject(raw)) {
    throw new BatchRefuse("invalid-request", "Batch request must be a JSON object");
  }
  if (raw.schema && raw.schema !== REQUEST_SCHEMA) {
    throw new BatchRefuse("unknown-schema", `Unsupported schema ${raw.schema}`);
  }
  if (integerTermsVersionRejected(raw.termsVersion)) {
    throw new BatchRefuse(
      "invalid_input",
      "integer termsVersion is not a public claim key; I01 uses sha256:<64 hex>",
      { termsVersion: raw.termsVersion },
    );
  }
  if (!Array.isArray(raw.items) || raw.items.length === 0) {
    throw new BatchRefuse("empty-batch", "items[] is required");
  }

  const runner = raw.runner || "paid-useful-jobs";
  if (FALLBACK_RUNNERS.includes(runner)) {
    throw new BatchRefuse(
      "fallback-runner-refused",
      "This ledger consumes the current execution.v1 core through the request desk; a second useful-jobs kernel is not a fallback",
      { runner, pin: F08_PIN_SHA },
    );
  }
  if (!KNOWN_RUNNERS.includes(runner)) {
    throw new BatchRefuse("unknown-runner", `Unsupported runner ${runner}`, { runner });
  }

  const items = raw.items.map((item, index) => {
    if (!isPlainObject(item)) {
      throw new BatchRefuse("invalid-item", `items[${index}] must be an object`);
    }
    const engineId = item.engineId || item.jobId;
    if (!engineId) {
      throw new BatchRefuse("missing-engine", `items[${index}] requires engineId`);
    }
    const id = item.id || `item-${index + 1}-${engineId}`;
    if (!isSafeItemId(id)) {
      throw new BatchRefuse("traversing-item", "Item id must be a single non-traversing path segment", {
        id,
        index,
      });
    }
    let job;
    try {
      job = getJob(engineId);
    } catch {
      job = null;
    }
    const files = confineFiles(filesFromItem(item), baseDir);
    const payment = loadPayment(item, baseDir);
    return {
      id,
      index,
      engineId,
      job,
      files,
      example: item.example === true || item.example === "true",
      funding: item.funding || item.fundingIntent || (payment ? "reserved-fixture" : "unfunded"),
      fundingIntent: item.fundingIntent || item.funding,
      payment,
      settle: item.settle === true,
      liveSettle: item.liveSettle === true,
      sold: item.sold === true,
      price: item.price,
      amountUsdc: item.amountUsdc,
      amount: item.amount,
      publishToLiveCatalog: item.publishToLiveCatalog === true,
      raw: item,
    };
  });

  const seen = new Set();
  for (const item of items) {
    if (seen.has(item.id)) {
      throw new BatchRefuse("duplicate-item", `Duplicate item id ${item.id}`, { id: item.id });
    }
    seen.add(item.id);
  }

  return {
    schema: REQUEST_SCHEMA,
    runner: "paid-useful-jobs",
    runnerPin: CURRENT_RUNTIME_PIN,
    publishToLiveCatalog: raw.publishToLiveCatalog === true,
    items,
    raw,
    baseDir,
  };
}

export function missingRequired(item) {
  if (!item.job) return { code: "unknown-engine", missing: [] };
  if (item.example) return null;
  const required = requiredKeys(item.job);
  const missing = required.filter((key) => {
    const value = item.files[key];
    return value == null || value === false || value === "";
  });
  if (missing.length) {
    return {
      code: "missing-required-inputs",
      message: `Caller mode requires ${item.job.requiredInputs.join(", ")}`,
      missing,
    };
  }
  for (const [key, filePath] of Object.entries(item.files)) {
    if (typeof filePath !== "string" || looksJsonText(filePath)) continue;
    if (!existsSync(filePath)) {
      return {
        code: "input-missing-file",
        message: `Input ${key} file not found: ${filePath}`,
        key,
        path: filePath,
      };
    }
    const bytes = statSync(filePath).size;
    if (bytes > MAX_INPUT_BYTES) {
      return {
        code: "input-oversize",
        message: `Input ${key} is ${bytes} bytes; max is ${MAX_INPUT_BYTES}`,
        key,
        bytes,
      };
    }
  }
  return null;
}

export function requestBaseDirFromPath(filePath) {
  return dirname(resolve(filePath));
}
