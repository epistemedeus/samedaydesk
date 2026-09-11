import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { REQUEST_SCHEMA, MAX_INPUT_BYTES } from "./pins.mjs";
import { getJob, requiredKeys } from "./catalog.mjs";
import { filesFromItem } from "./sample.mjs";
import { fixturePaymentTemplate } from "./funding.mjs";
import { integerTermsVersionRejected } from "./terms.mjs";

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
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return value;
  const abs = isAbsolute(trimmed) ? trimmed : resolve(baseDir, trimmed);
  return abs;
}

function loadPayment(item, baseDir) {
  if (isPlainObject(item.payment)) return item.payment;
  if (typeof item.payment === "string") {
    const path = resolveMaybePath(item.payment, baseDir);
    return JSON.parse(readFileSync(path, "utf8"));
  }
  if ((item.funding === "reserved-fixture" || item.fundingIntent === "reserved-fixture") && !item.payment) {
    return fixturePaymentTemplate();
  }
  return null;
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

  const items = raw.items.map((item, index) => {
    if (!isPlainObject(item)) {
      throw new BatchRefuse("invalid-item", `items[${index}] must be an object`);
    }
    const engineId = item.engineId || item.jobId;
    if (!engineId) {
      throw new BatchRefuse("missing-engine", `items[${index}] requires engineId`);
    }
    let job;
    try {
      job = getJob(engineId);
    } catch {
      job = null;
    }
    const files = {};
    const source = filesFromItem(item);
    for (const [key, value] of Object.entries(source)) {
      files[key] = resolveMaybePath(value, baseDir);
    }
    const payment = loadPayment(item, baseDir);
    return {
      id: item.id || `item-${index + 1}-${engineId}`,
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

  return {
    schema: REQUEST_SCHEMA,
    runner: raw.runner || "useful-jobs",
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
    if (typeof filePath !== "string") continue;
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
