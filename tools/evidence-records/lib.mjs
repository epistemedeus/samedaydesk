import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const DEFAULT_CATALOG = join(here, "catalog.json");
const DEFAULT_SCHEMA = join(here, "schema/evidence-record.v1.json");
const VALID_FIXTURES = join(here, "fixtures/valid");
const INVALID_FIXTURES = join(here, "fixtures/invalid");
const SETTLEMENT_FIXTURES = join(here, "fixtures/settlements");
const INVALID_MANIFEST = join(INVALID_FIXTURES, "manifest.json");
const DELIVERY_STATUS_RE = /^[a-z][a-z0-9_]{1,95}$/;
const TX_RE = /^0x[a-f0-9]{64}$/;

const TOKEN_RE = /^[a-z][a-z0-9_]{1,63}$/;
const POPULATION_RE = /^[a-z][a-z0-9_]{1,95}$/;
const RECORD_ID_RE = /^[a-z][a-z0-9_-]{2,95}$/;
const HOST_RE = /^[A-Za-z0-9][A-Za-z0-9.-]{0,253}$/;
const RFC3339_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d{3})Z$/;
const DECIMAL_RE = /^(?:0|[1-9][0-9]{0,15})(?:\.[0-9]{1,8})?$/;
const SURFACE_RE = /^[\x20-\x7E]{1,200}$/;
const UNKNOWN_RE = /^[\x20-\x7E]{1,160}$/;
const MAX_DELAY = 31_536_000;
const FORBIDDEN_KEYS = new Set([
  "__proto__",
  "prototype",
  "constructor",
  "providers",
  "providerIds",
  "additionalProviders",
  "sourceKinds",
  "authorityClasses",
]);
const ROOT_KEYS = Object.freeze([
  "schemaVersion",
  "recordId",
  "sourceKind",
  "producer",
  "scope",
  "observationWindow",
  "completeness",
  "authorityClass",
  "unknownWhenAbsent",
  "prohibitedInferences",
  "joins",
  "aggregates",
  "labels",
  "settlement",
]);
const PRODUCER_KEYS = Object.freeze(["id", "providerId", "adapterId", "observedSurface"]);
const SCOPE_KEYS = Object.freeze(["providerId", "population", "joinKeys", "host"]);
const WINDOW_KEYS = Object.freeze(["start", "end", "reportingDelaySeconds"]);
const JOIN_KEYS = Object.freeze(["otherSourceKind", "exactKey", "exactValue"]);
const AGGREGATE_KEYS = Object.freeze(["metricId", "parts"]);
const PART_KEYS = Object.freeze(["recordId", "authorityClass", "value"]);
const LABEL_KEYS = Object.freeze(["acquisition"]);
const SETTLEMENT_KEYS = Object.freeze([
  "operationId",
  "amountUsdc",
  "buyerClass",
  "validDeliveryStatus",
  "transaction",
  "facilitatorOrPayoutRef",
]);

export function defaultCatalogPath() {
  return DEFAULT_CATALOG;
}

export function defaultSchemaPath() {
  return DEFAULT_SCHEMA;
}

export function validFixtureDir() {
  return VALID_FIXTURES;
}

export function invalidFixtureDir() {
  return INVALID_FIXTURES;
}

export function settlementFixtureDir() {
  return SETTLEMENT_FIXTURES;
}

export function loadCatalog(catalogPath = DEFAULT_CATALOG) {
  const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
  if (!catalog || typeof catalog !== "object" || !catalog.sources) {
    throw new Error("catalog must contain a sources object");
  }
  return catalog;
}

export function loadSchema(schemaPath = DEFAULT_SCHEMA) {
  return JSON.parse(readFileSync(schemaPath, "utf8"));
}

export function loadJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

export function listJsonFiles(dir) {
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json") && name !== "manifest.json")
    .sort()
    .map((name) => join(dir, name));
}

export function loadInvalidManifest(manifestPath = INVALID_MANIFEST) {
  return JSON.parse(readFileSync(manifestPath, "utf8"));
}

function error(code, path, message) {
  return { code, path, message };
}

function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function ownKeys(value) {
  return Object.getOwnPropertyNames(value);
}

function allowKeys(obj, allowed, path, errors) {
  const allowedSet = new Set(allowed);
  for (const key of ownKeys(obj)) {
    if (FORBIDDEN_KEYS.has(key) || !allowedSet.has(key)) {
      errors.push(error("additional_property", `${path}.${key}`, `property ${key} is not allowed`));
    }
  }
}

function requireKeys(obj, required, path, errors) {
  for (const key of required) {
    if (!Object.hasOwn(obj, key)) {
      errors.push(error("invalid_shape", path, `missing ${key}`));
    }
  }
}

function expectString(value, re, path, errors, code = "invalid_shape") {
  if (typeof value !== "string" || !re.test(value)) {
    errors.push(error(code, path, "invalid string"));
    return false;
  }
  return true;
}

function expectUniqueStringArray(value, path, errors, itemRe, { min, max }) {
  if (!Array.isArray(value) || Object.keys(value).length !== value.length) {
    errors.push(error("invalid_shape", path, "expected array"));
    return false;
  }
  if (value.length < min || value.length > max) {
    errors.push(error("invalid_shape", path, `expected ${min} to ${max} items`));
    return false;
  }
  const seen = new Set();
  for (let i = 0; i < value.length; i += 1) {
    const item = value[i];
    if (typeof item !== "string" || (itemRe && !itemRe.test(item))) {
      errors.push(error("invalid_shape", `${path}[${i}]`, "invalid item"));
      continue;
    }
    if (seen.has(item)) {
      errors.push(error("invalid_shape", `${path}[${i}]`, "duplicate item"));
    }
    seen.add(item);
  }
  return true;
}

function parseRfc3339(value) {
  if (typeof value !== "string" || !RFC3339_RE.test(value)) return null;
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return null;
  if (new Date(ms).toISOString() !== value) return null;
  return ms;
}

function collectProviderIds(record) {
  const ids = new Set();
  if (typeof record?.producer?.providerId === "string") ids.add(record.producer.providerId);
  if (typeof record?.scope?.providerId === "string") ids.add(record.scope.providerId);
  return ids;
}

export function validateRecord(input, catalog = loadCatalog()) {
  const errors = [];
  if (!isPlainObject(input)) {
    return { ok: false, errors: [error("invalid_shape", "$", "record must be a plain object")] };
  }

  allowKeys(input, ROOT_KEYS, "$", errors);
  requireKeys(
    input,
    [
      "schemaVersion",
      "recordId",
      "sourceKind",
      "producer",
      "scope",
      "observationWindow",
      "completeness",
      "authorityClass",
      "unknownWhenAbsent",
      "prohibitedInferences",
    ],
    "$",
    errors,
  );

  if (input.schemaVersion !== catalog.recordSchemaVersion) {
    errors.push(error("unknown_schema_version", "$.schemaVersion", "unsupported schemaVersion"));
  }
  expectString(input.recordId, RECORD_ID_RE, "$.recordId", errors);

  const sourceKinds = Object.keys(catalog.sources);
  if (!sourceKinds.includes(input.sourceKind)) {
    errors.push(error("unknown_source_kind", "$.sourceKind", "unknown sourceKind"));
  }
  const source = catalog.sources[input.sourceKind];

  if (!catalog.completeness.includes(input.completeness)) {
    errors.push(error("invalid_completeness", "$.completeness", "completeness is not in the closed set"));
  }
  if (!catalog.authorityClasses.includes(input.authorityClass)) {
    errors.push(
      error("invalid_authority_class", "$.authorityClass", "authorityClass is not in the closed set"),
    );
  }

  if (!isPlainObject(input.producer)) {
    errors.push(error("invalid_shape", "$.producer", "producer must be an object"));
  } else {
    allowKeys(input.producer, PRODUCER_KEYS, "$.producer", errors);
    requireKeys(input.producer, PRODUCER_KEYS, "$.producer", errors);
    expectString(input.producer.id, TOKEN_RE, "$.producer.id", errors);
    expectString(input.producer.providerId, TOKEN_RE, "$.producer.providerId", errors);
    expectString(input.producer.adapterId, TOKEN_RE, "$.producer.adapterId", errors);
    expectString(input.producer.observedSurface, SURFACE_RE, "$.producer.observedSurface", errors);
  }

  if (!isPlainObject(input.scope)) {
    errors.push(error("invalid_shape", "$.scope", "scope must be an object"));
  } else {
    allowKeys(input.scope, SCOPE_KEYS, "$.scope", errors);
    requireKeys(input.scope, ["providerId", "population", "joinKeys"], "$.scope", errors);
    expectString(input.scope.providerId, TOKEN_RE, "$.scope.providerId", errors);
    expectString(input.scope.population, POPULATION_RE, "$.scope.population", errors);
    expectUniqueStringArray(input.scope.joinKeys, "$.scope.joinKeys", errors, TOKEN_RE, {
      min: 0,
      max: 16,
    });
    if (Object.hasOwn(input.scope, "host")) {
      expectString(input.scope.host, HOST_RE, "$.scope.host", errors);
    }
  }

  if (!isPlainObject(input.observationWindow)) {
    errors.push(error("invalid_shape", "$.observationWindow", "observationWindow must be an object"));
  } else {
    allowKeys(input.observationWindow, WINDOW_KEYS, "$.observationWindow", errors);
    requireKeys(input.observationWindow, WINDOW_KEYS, "$.observationWindow", errors);
    const start = parseRfc3339(input.observationWindow.start);
    const end = parseRfc3339(input.observationWindow.end);
    if (start === null) {
      errors.push(error("invalid_observation_window", "$.observationWindow.start", "invalid start"));
    }
    if (end === null) {
      errors.push(error("invalid_observation_window", "$.observationWindow.end", "invalid end"));
    }
    if (start !== null && end !== null && start >= end) {
      errors.push(error("invalid_observation_window", "$.observationWindow", "start must be before end"));
    }
    const delay = input.observationWindow.reportingDelaySeconds;
    if (!Number.isInteger(delay) || delay < 0 || delay > MAX_DELAY) {
      errors.push(
        error("invalid_observation_window", "$.observationWindow.reportingDelaySeconds", "invalid delay"),
      );
    }
  }

  expectUniqueStringArray(input.unknownWhenAbsent, "$.unknownWhenAbsent", errors, UNKNOWN_RE, {
    min: 1,
    max: 8,
  });

  const inferenceOk = expectUniqueStringArray(
    input.prohibitedInferences,
    "$.prohibitedInferences",
    errors,
    TOKEN_RE,
    { min: 4, max: 16 },
  );
  if (inferenceOk && Array.isArray(input.prohibitedInferences)) {
    const listed = new Set(input.prohibitedInferences);
    for (const code of input.prohibitedInferences) {
      if (!catalog.prohibitedInferences.includes(code)) {
        errors.push(error("unknown_prohibited_inference", "$.prohibitedInferences", code));
      }
    }
    for (const required of catalog.requiredProhibitedInferences) {
      if (!listed.has(required)) {
        errors.push(
          error("missing_prohibited_inference", "$.prohibitedInferences", `missing ${required}`),
        );
      }
    }
    if (source) {
      for (const extra of source.extraProhibitedInferences) {
        if (!listed.has(extra)) {
          errors.push(
            error("missing_prohibited_inference", "$.prohibitedInferences", `missing ${extra}`),
          );
        }
      }
    }
  }

  const providerIds = collectProviderIds(input);
  if (providerIds.size > 1) {
    errors.push(
      error(
        "collapsed_provider_scope",
        "$.scope.providerId",
        "record collapses more than one provider into a single scope",
      ),
    );
  } else if (source && providerIds.size === 1) {
    const [providerId] = providerIds;
    if (providerId !== source.providerId) {
      errors.push(
        error(
          "source_kind_provider_mismatch",
          "$.producer.providerId",
          "providerId is not the provider registered for this sourceKind",
        ),
      );
    }
  }

  if (Object.hasOwn(input, "joins")) {
    if (!Array.isArray(input.joins) || Object.keys(input.joins).length !== input.joins.length) {
      errors.push(error("invalid_shape", "$.joins", "joins must be an array"));
    } else if (input.joins.length > 16) {
      errors.push(error("invalid_shape", "$.joins", "too many joins"));
    } else {
      const joinKeys = Array.isArray(input.scope?.joinKeys) ? input.scope.joinKeys : [];
      for (let i = 0; i < input.joins.length; i += 1) {
        const join = input.joins[i];
        const path = `$.joins[${i}]`;
        if (!isPlainObject(join)) {
          errors.push(error("invalid_shape", path, "join must be an object"));
          continue;
        }
        allowKeys(join, JOIN_KEYS, path, errors);
        if (!sourceKinds.includes(join.otherSourceKind)) {
          errors.push(error("unknown_source_kind", `${path}.otherSourceKind`, "unknown otherSourceKind"));
        }
        const crossSource = join.otherSourceKind !== input.sourceKind;
        const hasKey = typeof join.exactKey === "string" && TOKEN_RE.test(join.exactKey);
        const hasValue = typeof join.exactValue === "string" && join.exactValue.length > 0;
        if (crossSource && (!hasKey || !hasValue)) {
          errors.push(
            error(
              "cross_source_join_without_exact_key",
              path,
              "cross-source join requires an exact key and value",
            ),
          );
        } else if (hasKey && !joinKeys.includes(join.exactKey)) {
          errors.push(
            error(
              "cross_source_join_without_exact_key",
              `${path}.exactKey`,
              "exactKey is not declared on this source",
            ),
          );
        }
        if (Object.hasOwn(join, "exactKey") && !hasKey) {
          errors.push(error("invalid_shape", `${path}.exactKey`, "invalid exactKey"));
        }
        if (Object.hasOwn(join, "exactValue") && !hasValue) {
          errors.push(error("invalid_shape", `${path}.exactValue`, "invalid exactValue"));
        }
      }
    }
  }

  if (Object.hasOwn(input, "aggregates")) {
    if (!Array.isArray(input.aggregates) || Object.keys(input.aggregates).length !== input.aggregates.length) {
      errors.push(error("invalid_shape", "$.aggregates", "aggregates must be an array"));
    } else if (input.aggregates.length > 8) {
      errors.push(error("invalid_shape", "$.aggregates", "too many aggregates"));
    } else {
      for (let i = 0; i < input.aggregates.length; i += 1) {
        const agg = input.aggregates[i];
        const path = `$.aggregates[${i}]`;
        if (!isPlainObject(agg)) {
          errors.push(error("invalid_shape", path, "aggregate must be an object"));
          continue;
        }
        allowKeys(agg, AGGREGATE_KEYS, path, errors);
        expectString(agg.metricId, TOKEN_RE, `${path}.metricId`, errors);
        if (!Array.isArray(agg.parts) || agg.parts.length < 1 || agg.parts.length > 16) {
          errors.push(error("invalid_shape", `${path}.parts`, "parts must be a non-empty array"));
          continue;
        }
        const classes = new Set();
        for (let j = 0; j < agg.parts.length; j += 1) {
          const part = agg.parts[j];
          const partPath = `${path}.parts[${j}]`;
          if (!isPlainObject(part)) {
            errors.push(error("invalid_shape", partPath, "part must be an object"));
            continue;
          }
          allowKeys(part, PART_KEYS, partPath, errors);
          expectString(part.recordId, RECORD_ID_RE, `${partPath}.recordId`, errors);
          if (!catalog.authorityClasses.includes(part.authorityClass)) {
            errors.push(
              error("invalid_authority_class", `${partPath}.authorityClass`, "invalid authorityClass"),
            );
          } else {
            classes.add(part.authorityClass);
          }
          expectString(part.value, DECIMAL_RE, `${partPath}.value`, errors);
        }
        if (classes.size > 1) {
          errors.push(
            error(
              "sum_across_authority_classes",
              `${path}.parts`,
              "cannot sum values across authority classes",
            ),
          );
        }
      }
    }
  }

  if (Object.hasOwn(input, "labels")) {
    if (!isPlainObject(input.labels)) {
      errors.push(error("invalid_shape", "$.labels", "labels must be an object"));
    } else {
      allowKeys(input.labels, LABEL_KEYS, "$.labels", errors);
      if (Object.hasOwn(input.labels, "acquisition")) {
        if (!catalog.acquisitionLabels.includes(input.labels.acquisition)) {
          errors.push(error("invalid_shape", "$.labels.acquisition", "unknown acquisition label"));
        } else if (
          catalog.controlledSourceKinds.includes(input.sourceKind) &&
          input.labels.acquisition === "organic"
        ) {
          errors.push(
            error(
              "organic_label_for_controlled_or_incentivized_traffic",
              "$.labels.acquisition",
              "controlled or incentivized traffic cannot be labeled organic",
            ),
          );
        }
      }
    }
  }

  if (Object.hasOwn(input, "settlement")) {
    if (!isPlainObject(input.settlement)) {
      errors.push(error("invalid_shape", "$.settlement", "settlement must be an object"));
    } else {
      allowKeys(input.settlement, SETTLEMENT_KEYS, "$.settlement", errors);
      requireKeys(
        input.settlement,
        ["operationId", "amountUsdc", "buyerClass", "validDeliveryStatus"],
        "$.settlement",
        errors,
      );
      expectString(input.settlement.operationId, RECORD_ID_RE, "$.settlement.operationId", errors);
      expectString(input.settlement.amountUsdc, DECIMAL_RE, "$.settlement.amountUsdc", errors);
      if (!Array.isArray(catalog.buyerClasses) || !catalog.buyerClasses.includes(input.settlement.buyerClass)) {
        errors.push(
          error("invalid_buyer_class", "$.settlement.buyerClass", "buyerClass is not in the closed set"),
        );
      }
      expectString(
        input.settlement.validDeliveryStatus,
        DELIVERY_STATUS_RE,
        "$.settlement.validDeliveryStatus",
        errors,
      );
      if (Object.hasOwn(input.settlement, "transaction")) {
        expectString(input.settlement.transaction, TX_RE, "$.settlement.transaction", errors);
      }
      if (Object.hasOwn(input.settlement, "facilitatorOrPayoutRef")) {
        expectString(
          input.settlement.facilitatorOrPayoutRef,
          SURFACE_RE,
          "$.settlement.facilitatorOrPayoutRef",
          errors,
        );
      }
    }
  }

  return errors.length === 0 ? { ok: true, errors: [] } : { ok: false, errors };
}

export function validateFile(filePath, catalog = loadCatalog()) {
  let record;
  try {
    record = loadJson(filePath);
  } catch (cause) {
    return {
      ok: false,
      filePath,
      errors: [error("invalid_shape", "$", `cannot parse JSON: ${cause.message}`)],
    };
  }
  const result = validateRecord(record, catalog);
  return { ...result, filePath };
}

export function runSuite(catalog = loadCatalog()) {
  const results = [];
  for (const filePath of listJsonFiles(VALID_FIXTURES)) {
    const result = validateFile(filePath, catalog);
    results.push({
      filePath,
      expect: "accept",
      ok: result.ok,
      errors: result.errors,
    });
  }

  const manifest = loadInvalidManifest();
  for (const [name, spec] of Object.entries(manifest)) {
    const filePath = join(INVALID_FIXTURES, name);
    const result = validateFile(filePath, catalog);
    const codes = result.errors.map((item) => item.code);
    const matched = !result.ok && codes.includes(spec.code);
    results.push({
      filePath,
      expect: "reject",
      expectedCode: spec.code,
      ok: matched,
      errors: result.errors,
    });
  }

  const passed = results.filter((item) => item.ok).length;
  const failed = results.length - passed;
  return {
    ok: failed === 0,
    passed,
    failed,
    total: results.length,
    results,
  };
}
