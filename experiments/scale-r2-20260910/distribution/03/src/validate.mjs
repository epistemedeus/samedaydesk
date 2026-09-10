import {
  AVAILABILITY_STATUS,
  CATALOG_SCHEMA,
  ERROR_CODES,
  FORBIDDEN_INVENTORY_FIELDS,
  FORBIDDEN_SECRET_FIELDS,
  INVENTORY_SCHEMA,
  PACKAGE_KINDS,
} from "./constants.mjs";

export function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

export function catalogError(code, message, details = null) {
  const err = new Error(message);
  err.code = code;
  err.details = details;
  return err;
}

function rejectForbidden(obj, path = "") {
  if (!isPlainObject(obj) && !Array.isArray(obj)) return;
  if (Array.isArray(obj)) {
    obj.forEach((item, i) => rejectForbidden(item, `${path}[${i}]`));
    return;
  }
  for (const key of Object.keys(obj)) {
    const here = path ? `${path}.${key}` : key;
    if (FORBIDDEN_INVENTORY_FIELDS.includes(key)) {
      throw catalogError(
        ERROR_CODES.FORBIDDEN_CLAIM,
        `Forbidden invented demand/revenue/listing field: ${key}`,
        { path: here },
      );
    }
    if (FORBIDDEN_SECRET_FIELDS.includes(key)) {
      throw catalogError(
        ERROR_CODES.FORBIDDEN_SECRET,
        `Forbidden secret field: ${key}`,
        { path: here },
      );
    }
    rejectForbidden(obj[key], here);
  }
}

function validateInstallCommand(cmd, path) {
  if (!isPlainObject(cmd)) {
    throw catalogError(ERROR_CODES.INVALID_INPUT, `${path} must be an object`);
  }
  if (typeof cmd.command !== "string" || !cmd.command.trim()) {
    throw catalogError(ERROR_CODES.INVALID_INPUT, `${path}.command must be a non-empty string`);
  }
  if (typeof cmd.observed !== "boolean") {
    throw catalogError(
      ERROR_CODES.INVALID_INPUT,
      `${path}.observed must be boolean (true=ran successfully on evidence VM; false=recommended-not-run)`,
    );
  }
}

function validateAvailability(av, path) {
  if (!isPlainObject(av)) {
    throw catalogError(ERROR_CODES.INVALID_INPUT, `${path} must be an object`);
  }
  const allowed = Object.values(AVAILABILITY_STATUS);
  if (!allowed.includes(av.status)) {
    throw catalogError(
      ERROR_CODES.INVALID_INPUT,
      `${path}.status must be one of ${allowed.join(", ")}`,
      { got: av.status ?? null },
    );
  }
  if (av.observedAt !== undefined && av.observedAt !== null) {
    if (typeof av.observedAt !== "string" || !av.observedAt.trim()) {
      throw catalogError(ERROR_CODES.INVALID_INPUT, `${path}.observedAt must be a non-empty string when set`);
    }
  }
  if (av.evidenceRefs !== undefined) {
    if (!Array.isArray(av.evidenceRefs)) {
      throw catalogError(ERROR_CODES.INVALID_INPUT, `${path}.evidenceRefs must be an array when set`);
    }
  }
  // Hard: unavailable must not claim a user count (unavailable ≠ no_users)
  if (av.status === AVAILABILITY_STATUS.UNAVAILABLE) {
    if (av.users !== undefined && av.users !== null) {
      throw catalogError(
        ERROR_CODES.INVALID_INPUT,
        `${path}.status=unavailable must not claim users (unavailable ≠ no_users)`,
      );
    }
    if (av.users === 0) {
      throw catalogError(
        ERROR_CODES.INVALID_INPUT,
        `${path}: unavailable must not report users=0`,
      );
    }
  }
  if (av.status === AVAILABILITY_STATUS.NO_USERS) {
    if (av.users !== 0 && av.users !== undefined) {
      throw catalogError(
        ERROR_CODES.INVALID_INPUT,
        `${path}.status=no_users requires users===0 when users is set`,
      );
    }
  }
}

function validatePackageEntry(entry, index) {
  const path = `packages[${index}]`;
  if (!isPlainObject(entry)) {
    throw catalogError(ERROR_CODES.INVALID_INPUT, `${path} must be an object`);
  }
  for (const k of ["id", "sourceRepo", "sourcePin", "sourcePath", "kind"]) {
    if (typeof entry[k] !== "string" || !entry[k].trim()) {
      throw catalogError(ERROR_CODES.INVALID_INPUT, `${path}.${k} must be a non-empty string`);
    }
  }
  if (!PACKAGE_KINDS.includes(entry.kind)) {
    throw catalogError(
      ERROR_CODES.INVALID_INPUT,
      `${path}.kind must be one of ${PACKAGE_KINDS.join(", ")}`,
      { got: entry.kind },
    );
  }
  if (!Array.isArray(entry.installCommands)) {
    throw catalogError(ERROR_CODES.INVALID_INPUT, `${path}.installCommands must be an array`);
  }
  entry.installCommands.forEach((cmd, i) => validateInstallCommand(cmd, `${path}.installCommands[${i}]`));
  if (!isPlainObject(entry.availability)) {
    throw catalogError(ERROR_CODES.MISSING_REQUIREMENT, `${path}.availability required`, {
      missing: [`${path}.availability`],
    });
  }
  validateAvailability(entry.availability, `${path}.availability`);
}

/**
 * Validate portable catalog inventory. Throws on malformed / forbidden.
 * Missing optional install commands are handled by buildCatalog as partial.
 */
export function validateInventory(raw) {
  if (!isPlainObject(raw)) {
    throw catalogError(ERROR_CODES.INVALID_INPUT, "inventory must be a plain object");
  }
  rejectForbidden(raw);

  if (raw.schema !== INVENTORY_SCHEMA) {
    throw catalogError(ERROR_CODES.INVALID_INPUT, `schema must be ${INVENTORY_SCHEMA}`, {
      got: raw.schema ?? null,
    });
  }
  if (typeof raw.cite !== "string" || !raw.cite.trim()) {
    throw catalogError(ERROR_CODES.INVALID_INPUT, "cite must be a non-empty string");
  }
  if (!Array.isArray(raw.packages)) {
    throw catalogError(ERROR_CODES.MISSING_REQUIREMENT, "packages must be an array", {
      missing: ["packages"],
    });
  }
  if (raw.packages.length < 1) {
    throw catalogError(ERROR_CODES.MISSING_REQUIREMENT, "packages must be non-empty", {
      missing: ["packages"],
    });
  }
  raw.packages.forEach((p, i) => validatePackageEntry(p, i));
  return raw;
}

export function validateCatalog(raw) {
  if (!isPlainObject(raw)) {
    throw catalogError(ERROR_CODES.INVALID_INPUT, "catalog must be a plain object");
  }
  rejectForbidden(raw);
  if (raw.schema !== CATALOG_SCHEMA) {
    throw catalogError(ERROR_CODES.INVALID_INPUT, `schema must be ${CATALOG_SCHEMA}`, {
      got: raw.schema ?? null,
    });
  }
  if (typeof raw.status !== "string" || !raw.status) {
    throw catalogError(ERROR_CODES.INVALID_INPUT, "catalog.status required");
  }
  if (!Array.isArray(raw.packages)) {
    throw catalogError(ERROR_CODES.INVALID_INPUT, "catalog.packages must be an array");
  }
  // Hard invariant across catalog entries
  for (const pkg of raw.packages) {
    const st = pkg?.availability?.status;
    if (st === AVAILABILITY_STATUS.UNAVAILABLE) {
      if (Object.prototype.hasOwnProperty.call(pkg.availability, "users")) {
        throw catalogError(
          ERROR_CODES.INVALID_INPUT,
          "unavailable availability must not include users (unavailable ≠ no_users)",
        );
      }
    }
    if (
      raw.labels?.collapsedUnavailableAsNoUsers === true ||
      (st === AVAILABILITY_STATUS.UNAVAILABLE && pkg.availability?.users === 0)
    ) {
      throw catalogError(
        ERROR_CODES.INVALID_INPUT,
        "unavailable capture must stay distinct from no_users",
      );
    }
  }
  return raw;
}
