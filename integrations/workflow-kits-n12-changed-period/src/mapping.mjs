/**
 * Declared, versioned record mapping. A mapping registry lists one entry per
 * mappingVersion. Each entry declares the exact source fields a workflow output
 * record must carry (path and type) and how each target is filled. Nothing is
 * guessed: an undeclared field, a missing field or a changed type is reported as
 * schema_changed with the field path, and the record is not evaluated.
 *
 * Targets fill the Useful Commerce permitted capture (captureId, capturedAt,
 * subject, sourceUri) and its payload (title, status, output). The journey then
 * derives period.recordEvidence: captureId and capturedAt come from the mapping,
 * ingestionDigest from the journey, taskId, contextId, followsTaskId and
 * correlationId from the period, and termsVersion is passed through from the
 * exchange preview or readAccepted result. The kit never hashes terms itself.
 */
export const REGISTRY_SCHEMA = "samedaydesk.workflow-kits-n12-changed-period.mapping-registry.v1";
export const SOURCE_TYPES = Object.freeze(["string", "number", "boolean", "array", "object"]);
export const TARGETS = Object.freeze([
  "recordKey",
  "capture.captureId",
  "capture.capturedAt",
  "capture.subject",
  "capture.sourceUri",
  "capture.permitted",
  "payload.title",
  "payload.status",
  "payload.output",
]);
const RULE_KEYS = Object.freeze(["from", "const", "enum"]);
const ENTRY_KEYS = Object.freeze(["mappingVersion", "appliesFrom", "notes", "source", "ignore", "targets"]);
const VERSION_RE = /^[a-z0-9][a-z0-9.-]{0,63}$/;
const PATH_RE = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$/;

const isPlainObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
export const typeOf = (value) => (Array.isArray(value) ? "array" : value === null ? "null" : typeof value);

function configError(path, message, suggestedAction) {
  return { code: "mapping_invalid", path, message, suggestedAction };
}

/** Validate a mapping registry. Returns { ok, errors }, each error with an exact path. */
export function validateMappingRegistry(registry) {
  const errors = [];
  const fix = "Correct the mapping registry at this path; the kit does not run a period on an invalid mapping.";
  if (!isPlainObject(registry)) return { ok: false, errors: [configError("$", "mapping registry must be a JSON object", fix)] };
  if (registry.schema !== REGISTRY_SCHEMA) errors.push(configError("$.schema", `schema must be ${REGISTRY_SCHEMA}`, fix));
  for (const key of Object.keys(registry)) {
    if (!["schema", "notice", "versions"].includes(key)) errors.push(configError(`$.${key}`, `unknown registry key ${key}`, fix));
  }
  if (!Array.isArray(registry.versions) || registry.versions.length === 0) {
    errors.push(configError("$.versions", "versions must be a non-empty array", fix));
    return { ok: false, errors };
  }
  const seen = new Set();
  registry.versions.forEach((entry, i) => {
    const at = `$.versions[${i}]`;
    if (!isPlainObject(entry)) { errors.push(configError(at, "mapping entry must be an object", fix)); return; }
    for (const key of Object.keys(entry)) if (!ENTRY_KEYS.includes(key)) errors.push(configError(`${at}.${key}`, `unknown mapping key ${key}`, fix));
    if (typeof entry.mappingVersion !== "string" || !VERSION_RE.test(entry.mappingVersion)) {
      errors.push(configError(`${at}.mappingVersion`, "mappingVersion must be a lower-case id such as workflow-output.v2", fix));
    } else if (seen.has(entry.mappingVersion)) {
      errors.push(configError(`${at}.mappingVersion`, `duplicate mappingVersion ${entry.mappingVersion}; add a new version instead of reusing one`, fix));
    } else seen.add(entry.mappingVersion);
    if (typeof entry.appliesFrom !== "string" || !entry.appliesFrom) errors.push(configError(`${at}.appliesFrom`, "appliesFrom must name the first period this version is for", fix));
    if (!isPlainObject(entry.source) || Object.keys(entry.source).length === 0) {
      errors.push(configError(`${at}.source`, "source must declare at least one field path and its type", fix));
      return;
    }
    const declared = Object.keys(entry.source);
    for (const path of declared) {
      if (!PATH_RE.test(path)) errors.push(configError(`${at}.source["${path}"]`, "source path must be dot-separated identifiers", fix));
      if (!SOURCE_TYPES.includes(entry.source[path])) errors.push(configError(`${at}.source["${path}"]`, `type must be one of ${SOURCE_TYPES.join(", ")}`, fix));
    }
    for (const path of declared) {
      const parent = declared.find((other) => path.startsWith(`${other}.`));
      if (parent) errors.push(configError(`${at}.source["${path}"]`, `${parent} is declared as a whole field, so ${path} cannot also be declared; declare only leaf paths`, fix));
    }
    const ignore = entry.ignore ?? [];
    if (!Array.isArray(ignore)) errors.push(configError(`${at}.ignore`, "ignore must be an array of declared source paths", fix));
    else ignore.forEach((path, j) => {
      if (!declared.includes(path)) errors.push(configError(`${at}.ignore[${j}]`, `ignored field ${path} is not declared in source`, fix));
    });
    if (!isPlainObject(entry.targets)) { errors.push(configError(`${at}.targets`, "targets must be an object", fix)); return; }
    for (const target of Object.keys(entry.targets)) {
      if (!TARGETS.includes(target)) errors.push(configError(`${at}.targets["${target}"]`, `unknown target; targets are ${TARGETS.join(", ")}`, fix));
    }
    const used = new Set();
    for (const target of TARGETS) {
      const rule = entry.targets[target];
      const rat = `${at}.targets["${target}"]`;
      if (rule === undefined) { errors.push(configError(rat, `target ${target} is not mapped`, fix)); continue; }
      if (!isPlainObject(rule)) { errors.push(configError(rat, "rule must be an object", fix)); continue; }
      for (const key of Object.keys(rule)) if (!RULE_KEYS.includes(key)) errors.push(configError(`${rat}.${key}`, `unknown rule key ${key}; rules use from, const or enum`, fix));
      const hasFrom = Object.prototype.hasOwnProperty.call(rule, "from");
      const hasConst = Object.prototype.hasOwnProperty.call(rule, "const");
      if (hasFrom === hasConst) { errors.push(configError(rat, "rule needs exactly one of from or const", fix)); continue; }
      if (hasConst && rule.enum !== undefined) errors.push(configError(`${rat}.enum`, "enum applies only to a from rule", fix));
      if (hasFrom) {
        if (!declared.includes(rule.from)) errors.push(configError(`${rat}.from`, `from references ${rule.from}, which is not declared in source`, fix));
        else if (ignore.includes(rule.from)) errors.push(configError(`${rat}.from`, `from references ${rule.from}, which is also in ignore`, fix));
        used.add(rule.from);
        if (rule.enum !== undefined) {
          if (!isPlainObject(rule.enum) || Object.keys(rule.enum).length === 0) errors.push(configError(`${rat}.enum`, "enum must map each expected source value (as a string) to a target value", fix));
        }
      }
    }
    for (const path of declared) {
      if (!used.has(path) && !ignore.includes(path)) errors.push(configError(`${at}.source["${path}"]`, `declared field ${path} is neither mapped nor ignored`, fix));
    }
  });
  return { ok: errors.length === 0, errors };
}

export function findMapping(registry, mappingVersion) {
  return registry.versions.find((entry) => entry.mappingVersion === mappingVersion) ?? null;
}

function getPath(record, path) {
  let value = record;
  for (const part of path.split(".")) {
    if (!isPlainObject(value) || !Object.prototype.hasOwnProperty.call(value, part)) return { present: false };
    value = value[part];
  }
  return { present: true, value };
}

function leafPaths(value, prefix, declared, out) {
  for (const key of Object.keys(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (declared[path] !== undefined) { out.push(path); continue; }
    if (isPlainObject(value[key]) && Object.keys(declared).some((d) => d.startsWith(`${path}.`))) leafPaths(value[key], path, declared, out);
    else out.push(path);
  }
  return out;
}

/**
 * Check one record against a declared mapping entry. Returns the list of field
 * differences, each { kind, path, expected, actual }. Kinds: field_missing,
 * field_unexpected, field_type_changed. Empty means the record matches.
 */
export function diffRecordShape(entry, record) {
  if (!isPlainObject(record)) return [{ kind: "record_not_object", path: "", expected: "object", actual: typeOf(record) }];
  const out = [];
  for (const [path, type] of Object.entries(entry.source)) {
    const got = getPath(record, path);
    if (!got.present) out.push({ kind: "field_missing", path, expected: type, actual: null });
    else if (typeOf(got.value) !== type) out.push({ kind: "field_type_changed", path, expected: type, actual: typeOf(got.value) });
  }
  for (const path of leafPaths(record, "", entry.source, [])) {
    if (entry.source[path] === undefined) out.push({ kind: "field_unexpected", path, expected: null, actual: typeOf(getPath(record, path).value) });
  }
  return out;
}

function applyRule(rule, record) {
  if (Object.prototype.hasOwnProperty.call(rule, "const")) return { ok: true, value: rule.const };
  const value = getPath(record, rule.from).value;
  if (rule.enum === undefined) return { ok: true, value };
  const key = String(value);
  if (!Object.prototype.hasOwnProperty.call(rule.enum, key)) return { ok: false, from: rule.from, value };
  return { ok: true, value: rule.enum[key] };
}

/**
 * Map one record with a declared entry. Returns { ok, recordKey, capture } or
 * { ok: false, recordKey, differences } (shape mismatch or an enum value the
 * mapping does not list).
 */
export function mapRecord(entry, record, { captureSchema, synthetic = true } = {}) {
  const differences = diffRecordShape(entry, record);
  const keyRule = entry.targets.recordKey;
  const keyValue = keyRule && isPlainObject(record) ? applyRule(keyRule, record) : { ok: false };
  const recordKey = keyValue.ok && typeof keyValue.value === "string" ? keyValue.value : null;
  if (differences.length) return { ok: false, recordKey, differences };
  const values = {};
  for (const target of TARGETS) {
    const result = applyRule(entry.targets[target], record);
    if (!result.ok) {
      return { ok: false, recordKey, differences: [{ kind: "value_not_in_enum", path: result.from, expected: Object.keys(entry.targets[target].enum), actual: result.value }] };
    }
    values[target] = result.value;
  }
  return {
    ok: true,
    recordKey: String(values.recordKey),
    capture: {
      synthetic,
      schema: captureSchema,
      captureId: values["capture.captureId"],
      subject: values["capture.subject"],
      capturedAt: values["capture.capturedAt"],
      sourceUri: values["capture.sourceUri"],
      payload: { title: values["payload.title"], status: values["payload.status"], output: values["payload.output"] },
      permission: { permitted: values["capture.permitted"] === true },
    },
  };
}
