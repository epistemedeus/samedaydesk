/**
 * Explicit, caller-declared payload adapters for a later-period schema change.
 *
 * Rules:
 * - An adapter runs only when the caller names it in `schemaAdapter.payloadVersion`.
 *   Nothing here is applied automatically, so an undeclared change still reaches the
 *   journey and is reported as `schema_changed`.
 * - The adapter renames declared keys only. It refuses when the source key is absent
 *   or when the target key is already present, instead of guessing.
 * - The adapted record is evaluated as a NEW request (new request digest). The period N
 *   effect is never touched.
 */
import { CAPTURE_SCHEMA, projectIngestionRecord } from "./vendor-paths.mjs";

export const SCHEMA_ADAPTERS = Object.freeze({
  "later-period-output-keys.v1": Object.freeze({
    captureSchema: CAPTURE_SCHEMA,
    renames: Object.freeze([["outputKeys", "output"]]),
    note: "Period N+1 renamed payload.output to payload.outputKeys (vendored fixture synthetic-later-period-schema-change.json).",
  }),
});

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function renameKeys(payload, renames) {
  const next = {};
  const renamed = [];
  const map = new Map(renames);
  for (const [key, value] of Object.entries(payload)) {
    if (map.has(key)) {
      next[map.get(key)] = value;
      renamed.push([key, map.get(key)]);
    } else {
      next[key] = value;
    }
  }
  return { next, renamed };
}

function refusal(reason, message) {
  return { ok: false, applied: false, reason, message };
}

/**
 * Apply the declared adapter, if any, to a kit period input.
 * Returns { ok, applied, input, adapter } or a refusal { ok:false, reason, message }.
 */
export function applyDeclaredSchemaAdapter(input) {
  const declared = input?.schemaAdapter ?? null;
  if (declared == null) return { ok: true, applied: false, input, adapter: null };
  const version = typeof declared === "string" ? declared : declared.payloadVersion;
  const spec = SCHEMA_ADAPTERS[version];
  if (!spec) {
    return refusal("schema_adapter_unknown", `schema adapter ${JSON.stringify(version)} is not a declared adapter version`);
  }
  const ingestion = input.ingestion;
  if (!isPlainObject(ingestion) || ingestion.schema !== spec.captureSchema || !isPlainObject(ingestion.payload)) {
    return refusal("schema_adapter_not_applicable", "the declared adapter needs a permitted-capture record with an object payload");
  }
  for (const [from, to] of spec.renames) {
    if (!Object.prototype.hasOwnProperty.call(ingestion.payload, from)) {
      return refusal("schema_adapter_not_applicable", `payload has no ${from}; the declared adapter does not apply`);
    }
    if (Object.prototype.hasOwnProperty.call(ingestion.payload, to)) {
      return refusal("schema_adapter_conflict", `payload already has ${to}; refusing to choose between ${from} and ${to}`);
    }
  }
  const original = projectIngestionRecord(ingestion);
  const { next: payload, renamed } = renameKeys(ingestion.payload, spec.renames);
  const workflowOutput = isPlainObject(input.workflowOutput)
    ? renameKeys(input.workflowOutput, spec.renames).next
    : input.workflowOutput;
  return {
    ok: true,
    applied: true,
    input: { ...input, ingestion: { ...ingestion, payload }, workflowOutput },
    adapter: {
      payloadVersion: version,
      captureSchema: spec.captureSchema,
      renamed,
      originalIngestionDigest: original.ok ? original.digest : null,
      declaredBy: "caller",
    },
  };
}
