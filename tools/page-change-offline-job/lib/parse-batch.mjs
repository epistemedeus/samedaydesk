import {
  COMPARABLE_STATUSES,
  ERROR_CODES,
  EXTRACT_PRODUCT,
  EXTRACT_SCHEMA,
  EXTRACT_TOP_FIELDS,
  ROW_STATUSES,
  SOURCE_REQUIRED_KEYS,
} from "./constants.mjs";
import { isPlainObject } from "./canonical.mjs";
import { refuseQuoteAsSuccess } from "./refuse.mjs";

function missingKeys(object, required) {
  return required.filter((key) => !Object.hasOwn(object, key));
}

function observationFrom(item) {
  const provenance = isPlainObject(item.provenance) ? item.provenance : {};
  return {
    itemId: typeof item.id === "string" ? item.id : null,
    requestedAt: provenance.requestedAt ?? null,
    completedAt: provenance.completedAt ?? null,
    fetchedAt: provenance.fetchedAt ?? null,
    requestedAtIsNotFreshness: true,
    fetchedAtIsNotFreshness: true,
  };
}

function rowFrom(item, sourceKey) {
  const status = ROW_STATUSES.includes(item.status) ? item.status : "unknown";
  return {
    id: typeof item.id === "string" ? item.id : null,
    source: typeof item.source === "string" ? item.source : "",
    sourceKey,
    status,
    data: item.data === undefined ? null : item.data,
    notes: Array.isArray(item.notes) ? item.notes : [],
    error: item.error ?? null,
    provenance: item.provenance ?? null,
    observation: observationFrom(item),
    comparable: COMPARABLE_STATUSES.includes(status) && isPlainObject(item.data),
  };
}

export function parseExtractBatch(body, limits, { treatQuoteAsSuccess = false } = {}) {
  refuseQuoteAsSuccess(body, { treatQuoteAsSuccess });
  if (!isPlainObject(body)) {
    const error = new Error("extract-batch body must be a JSON object");
    error.code = ERROR_CODES.UNRECOGNIZED_BATCH;
    throw error;
  }

  const issues = [];
  if (body.product !== EXTRACT_PRODUCT) issues.push("merchant_product_mismatch");
  if (body.schemaVersion !== EXTRACT_SCHEMA) issues.push("merchant_schema_mismatch");
  const missingTop = missingKeys(body, EXTRACT_TOP_FIELDS);
  if (missingTop.length) issues.push("merchant_required_keys_missing");
  if (!Array.isArray(body.sources)) issues.push("merchant_sources_missing");

  const fatal = issues.some((issue) =>
    issue === "merchant_product_mismatch"
    || issue === "merchant_schema_mismatch"
    || issue === "merchant_required_keys_missing"
    || issue === "merchant_sources_missing",
  );
  if (fatal) {
    return {
      kind: null,
      jobId: body.jobId ?? null,
      jobStatus: body.jobStatus ?? null,
      charged: Object.hasOwn(body, "charged") ? body.charged : null,
      ok: Object.hasOwn(body, "ok") ? body.ok : null,
      quote: isPlainObject(body.quote) ? body.quote : null,
      rows: [],
      issues,
      truncated: false,
      observation: { artifactObservedAt: null },
    };
  }

  const list = body.sources;
  let truncated = false;
  if (list.length > limits.maxSources) {
    truncated = true;
    issues.push("source_limit");
  }
  const bounded = list.slice(0, limits.maxSources);
  const rows = [];
  for (const item of bounded) {
    if (!isPlainObject(item)) {
      issues.push("row_not_an_object");
      continue;
    }
    if (missingKeys(item, SOURCE_REQUIRED_KEYS).length) issues.push("merchant_source_keys_missing");
    const sourceKey = typeof item.source === "string" ? item.source.trim() : "";
    if (!sourceKey) issues.push("source_identity_missing");
    rows.push(rowFrom(item, sourceKey));
  }

  const completed = rows
    .map((row) => row.observation.completedAt)
    .filter((value) => typeof value === "string");

  return {
    kind: "merchant_extract_batch",
    jobId: body.jobId ?? null,
    jobStatus: body.jobStatus ?? null,
    charged: Object.hasOwn(body, "charged") ? body.charged : null,
    ok: Object.hasOwn(body, "ok") ? body.ok : null,
    quote: isPlainObject(body.quote) ? body.quote : null,
    partial: body.partial === true,
    accounting: isPlainObject(body.accounting) ? body.accounting : null,
    rows,
    issues: [...new Set(issues)],
    truncated,
    observation: {
      artifactObservedAt: completed.length ? completed.sort().at(-1) : null,
      jobId: body.jobId ?? null,
      note: "Observation timestamps record when a batch row was produced. They are not page-content freshness.",
    },
  };
}
