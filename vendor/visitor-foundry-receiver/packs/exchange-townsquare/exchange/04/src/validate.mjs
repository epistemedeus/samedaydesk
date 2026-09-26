import {
  CONTRACT_SCHEMA,
  DEFAULT_ALLOWED_FORMATS,
  ERROR_CODES,
  FORBIDDEN_FIELDS,
  SUBMISSION_SCHEMA,
} from "./constants.mjs";
import { analyzePath, extensionOf } from "./paths.mjs";

export function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function admitError(code, message, details = undefined) {
  const err = new Error(message);
  err.code = code;
  if (details !== undefined) err.details = details;
  return err;
}

function requireNonEmptyString(value, label, { max = 500 } = {}) {
  if (typeof value !== "string" || !value.trim()) {
    throw admitError(ERROR_CODES.INVALID_INPUT, `${label} must be a non-empty string`);
  }
  if (value.length > max) {
    throw admitError(ERROR_CODES.INVALID_INPUT, `${label} exceeds max length ${max}`);
  }
  return value.trim();
}

export function assertNoForbidden(record, label) {
  if (!isPlainObject(record)) return;
  for (const key of FORBIDDEN_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(record, key)) {
      throw admitError(ERROR_CODES.FORBIDDEN_CLAIM, `${label} declares forbidden field ${key}`, {
        field: key,
      });
    }
  }
}

/**
 * Normalize a file-set contract. May be taken from brief.bounds.fileSetContract
 * or a standalone contract object.
 */
export function validateFileSetContract(raw) {
  if (!isPlainObject(raw)) {
    throw admitError(ERROR_CODES.INVALID_INPUT, "contract must be an object");
  }
  assertNoForbidden(raw, "contract");
  if (raw.schema != null && raw.schema !== CONTRACT_SCHEMA) {
    throw admitError(
      ERROR_CODES.INVALID_INPUT,
      `contract.schema must be ${CONTRACT_SCHEMA} when present`,
    );
  }

  const requiredFiles = Array.isArray(raw.requiredFiles) ? raw.requiredFiles : null;
  if (!requiredFiles || requiredFiles.length < 1) {
    throw admitError(ERROR_CODES.INVALID_INPUT, "contract.requiredFiles must be a non-empty array");
  }

  const normalizedRequired = requiredFiles.map((item, i) => {
    if (typeof item === "string") {
      const pathInfo = analyzePath(item);
      if (!pathInfo.ok) {
        throw admitError(ERROR_CODES.INVALID_INPUT, `contract.requiredFiles[${i}] unsafe path`, {
          reason: pathInfo.reason,
        });
      }
      return { path: pathInfo.normalized, format: extensionOf(pathInfo.normalized) };
    }
    if (!isPlainObject(item)) {
      throw admitError(ERROR_CODES.INVALID_INPUT, `contract.requiredFiles[${i}] must be string or object`);
    }
    const pathInfo = analyzePath(requireNonEmptyString(item.path, `contract.requiredFiles[${i}].path`));
    if (!pathInfo.ok) {
      throw admitError(ERROR_CODES.INVALID_INPUT, `contract.requiredFiles[${i}].path unsafe`, {
        reason: pathInfo.reason,
      });
    }
    const format =
      item.format == null
        ? extensionOf(pathInfo.normalized)
        : requireNonEmptyString(item.format, `contract.requiredFiles[${i}].format`, {
            max: 32,
          }).toLowerCase();
    return { path: pathInfo.normalized, format };
  });

  const allowedFormats = Array.isArray(raw.allowedFormats)
    ? raw.allowedFormats.map((f, i) =>
        requireNonEmptyString(f, `contract.allowedFormats[${i}]`, { max: 32 }).toLowerCase(),
      )
    : [...DEFAULT_ALLOWED_FORMATS];

  const maxBytesPerFile =
    raw.maxBytesPerFile == null
      ? 1_000_000
      : Number.isInteger(raw.maxBytesPerFile) && raw.maxBytesPerFile > 0
        ? raw.maxBytesPerFile
        : (() => {
            throw admitError(ERROR_CODES.INVALID_INPUT, "contract.maxBytesPerFile must be positive integer");
          })();
  const maxTotalBytes =
    raw.maxTotalBytes == null
      ? 5_000_000
      : Number.isInteger(raw.maxTotalBytes) && raw.maxTotalBytes > 0
        ? raw.maxTotalBytes
        : (() => {
            throw admitError(ERROR_CODES.INVALID_INPUT, "contract.maxTotalBytes must be positive integer");
          })();

  return {
    schema: CONTRACT_SCHEMA,
    requiredFiles: normalizedRequired,
    allowedFormats,
    maxBytesPerFile,
    maxTotalBytes,
    allowExtraFiles: raw.allowExtraFiles === true,
    taskId: raw.taskId == null ? null : requireNonEmptyString(String(raw.taskId), "contract.taskId", { max: 128 }),
  };
}

export function validateSubmission(raw) {
  if (!isPlainObject(raw)) {
    throw admitError(ERROR_CODES.INVALID_INPUT, "submission must be an object");
  }
  assertNoForbidden(raw, "submission");
  if (raw.schema != null && raw.schema !== SUBMISSION_SCHEMA) {
    throw admitError(
      ERROR_CODES.INVALID_INPUT,
      `submission.schema must be ${SUBMISSION_SCHEMA} when present`,
    );
  }
  if (!Array.isArray(raw.files) || raw.files.length < 1) {
    throw admitError(ERROR_CODES.INVALID_INPUT, "submission.files must be a non-empty array");
  }

  const files = raw.files.map((file, i) => {
    if (!isPlainObject(file)) {
      throw admitError(ERROR_CODES.INVALID_INPUT, `submission.files[${i}] must be an object`);
    }
    const pathRaw = requireNonEmptyString(file.path, `submission.files[${i}].path`, { max: 500 });
    const pathInfo = analyzePath(pathRaw);
    const byteLength = file.byteLength;
    if (!Number.isInteger(byteLength) || byteLength < 0) {
      throw admitError(
        ERROR_CODES.INVALID_INPUT,
        `submission.files[${i}].byteLength must be a non-negative integer`,
      );
    }
    const format =
      file.format == null
        ? extensionOf(pathInfo.normalized || pathRaw.replace(/\\/g, "/"))
        : requireNonEmptyString(file.format, `submission.files[${i}].format`, { max: 32 }).toLowerCase();
    return {
      path: pathRaw,
      pathInfo,
      normalizedPath: pathInfo.normalized,
      byteLength,
      format,
    };
  });

  const seenNormalized = new Set();
  for (const file of files) {
    if (!file.pathInfo.ok || !file.normalizedPath) continue;
    if (seenNormalized.has(file.normalizedPath)) {
      throw admitError(
        ERROR_CODES.INVALID_INPUT,
        `submission has duplicate normalized path ${file.normalizedPath}`,
      );
    }
    seenNormalized.add(file.normalizedPath);
  }

  return {
    schema: SUBMISSION_SCHEMA,
    files,
    demo: raw.demo === true,
  };
}

/**
 * Prefer standalone contract; else brief.bounds.fileSetContract; else derive a
 * minimal single-json contract from deliverableContract.requiredFields.
 */
export function resolveContractFromBriefOrContract(briefOrContract) {
  if (!isPlainObject(briefOrContract)) {
    throw admitError(ERROR_CODES.INVALID_INPUT, "briefOrContract must be an object");
  }
  if (Array.isArray(briefOrContract.requiredFiles)) {
    return validateFileSetContract(briefOrContract);
  }
  const nested = briefOrContract.bounds?.fileSetContract;
  if (isPlainObject(nested)) {
    return validateFileSetContract({
      ...nested,
      taskId: nested.taskId ?? briefOrContract.taskId ?? null,
    });
  }
  // Derive: single artifact.json with required JSON fields noted in contract meta only.
  const fields = briefOrContract.deliverableContract?.requiredFields;
  if (Array.isArray(fields) && fields.length > 0) {
    const maxBytes = briefOrContract.deliverableContract?.maxBytes ?? null;
    return validateFileSetContract({
      taskId: briefOrContract.taskId ?? null,
      requiredFiles: [{ path: "artifact.json", format: "json" }],
      allowedFormats: ["json"],
      maxBytesPerFile: maxBytes ?? 1_000_000,
      maxTotalBytes: maxBytes ?? 5_000_000,
      allowExtraFiles: false,
    });
  }
  throw admitError(
    ERROR_CODES.INVALID_INPUT,
    "no file-set contract found (need requiredFiles, bounds.fileSetContract, or deliverableContract.requiredFields)",
  );
}

function applyBriefByteLimits(contract, briefMax) {
  if (briefMax == null) return contract;
  return {
    ...contract,
    maxBytesPerFile: Math.min(contract.maxBytesPerFile, briefMax),
    maxTotalBytes: Math.min(contract.maxTotalBytes, briefMax),
  };
}

function tryResolveContractFromBrief(brief) {
  try {
    return resolveContractFromBriefOrContract(brief);
  } catch {
    return null;
  }
}

/**
 * One effective admission contract. An additional same-task contract cannot
 * silently relax brief limits or drop required deliverables. Foreign task IDs stop.
 */
function foreignFileSetGate(contractTask, briefTask) {
  if (contractTask != null && briefTask != null && contractTask !== briefTask) {
    return {
      ok: false,
      contract: null,
      boundIntoBrief: false,
      gate: {
        decision: "stop",
        reason: "foreign_file_set_contract",
        continueJourney: false,
        attachDeliverable: false,
        contractTask,
        briefTask,
      },
    };
  }
  return null;
}

export function effectiveAdmissionContract(brief, additionalRaw) {
  const briefTask = brief?.taskId ?? null;
  const briefMax = brief?.deliverableContract?.maxBytes ?? null;
  const nested = isPlainObject(brief?.bounds?.fileSetContract) ? brief.bounds.fileSetContract : null;
  const nestedForeign = foreignFileSetGate(nested?.taskId ?? null, briefTask);
  if (nestedForeign) return nestedForeign;

  const briefContract = brief ? tryResolveContractFromBrief(brief) : null;
  const resolvedForeign = foreignFileSetGate(briefContract?.taskId ?? null, briefTask);
  if (resolvedForeign) return resolvedForeign;

  if (additionalRaw != null) {
    if (!isPlainObject(additionalRaw)) {
      throw admitError(ERROR_CODES.INVALID_INPUT, "fileSetContract must be an object");
    }
    const additional = validateFileSetContract(additionalRaw);
    const additionalForeign = foreignFileSetGate(additional.taskId ?? null, briefTask);
    if (additionalForeign) return additionalForeign;

    if (!briefContract) {
      return {
        ok: true,
        contract: applyBriefByteLimits({ ...additional, taskId: additional.taskId ?? briefTask }, briefMax),
        boundIntoBrief: true,
        gate: null,
      };
    }

    const requiredByPath = new Map();
    for (const file of briefContract.requiredFiles) requiredByPath.set(file.path, file);
    for (const file of additional.requiredFiles) {
      if (!requiredByPath.has(file.path)) requiredByPath.set(file.path, file);
    }

    const additionalFormats = new Set(additional.allowedFormats);
    const allowedFormats = briefContract.allowedFormats.filter((format) => additionalFormats.has(format));
    if (allowedFormats.length < 1) {
      return {
        ok: false,
        contract: null,
        boundIntoBrief: false,
        gate: {
          decision: "stop",
          reason: "file_contract_format_conflict",
          continueJourney: false,
          attachDeliverable: false,
        },
      };
    }

    const contract = applyBriefByteLimits(
      {
        schema: CONTRACT_SCHEMA,
        requiredFiles: [...requiredByPath.values()],
        allowedFormats,
        maxBytesPerFile: Math.min(briefContract.maxBytesPerFile, additional.maxBytesPerFile),
        maxTotalBytes: Math.min(briefContract.maxTotalBytes, additional.maxTotalBytes),
        allowExtraFiles: briefContract.allowExtraFiles === true && additional.allowExtraFiles === true,
        taskId: briefContract.taskId ?? additional.taskId ?? briefTask,
      },
      briefMax,
    );

    return { ok: true, contract, boundIntoBrief: true, gate: null };
  }

  if (briefContract) {
    return {
      ok: true,
      contract: applyBriefByteLimits(briefContract, briefMax),
      boundIntoBrief: false,
      gate: null,
    };
  }

  return {
    ok: false,
    contract: null,
    boundIntoBrief: false,
    gate: {
      decision: "stop",
      reason: "no_file_set_contract",
      continueJourney: false,
      attachDeliverable: false,
    },
  };
}
