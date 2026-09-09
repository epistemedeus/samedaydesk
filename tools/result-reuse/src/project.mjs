import { detectKind } from "./kinds.mjs";
import {
  SELECTABLE,
  containsHostileMarkup,
  credentialHits,
  isForbiddenKey,
  isPublicHttpUrl,
  looksLikeFilesystemPath,
  sha256Json,
} from "./omit.mjs";
import { checkInputBounds, checkPayloadBytes } from "./limits.mjs";

const DEFAULT_SELECT = Object.freeze([
  "schema",
  "kind",
  "schemaVersion",
  "product",
  "jobId",
  "jobStatus",
  "partial",
  "status",
  "ok",
  "verdict",
  "fields",
  "freshness",
  "claims",
  "summary",
  "url",
  "title",
  "contentHash",
  "httpStatus",
  "networkUsed",
  "rows",
  "coverageUnknown",
  "sources",
  "records",
  "invalidRecords",
]);

export function projectResult(input, { select = [] } = {}) {
  const bounded = checkInputBounds(input);
  if (!bounded.ok) return bounded;
  const detected = detectKind(input);
  if (detected.kind === "unknown") {
    return {
      ok: false,
      message: "unrecognized result; supply extract-batch, page-change brief, record report, or n45 page-change result JSON",
      kind: "unknown",
    };
  }
  const requested = normalizeSelect(select);
  if (!requested.ok) return requested;

  const omitted = [];
  const payload = {};
  const walk = (value, path) => scrub(value, path, omitted);

  try {
    if (detected.kind === "page_change_brief") {
      const pageChange = {
        schema: detected.report.schema,
        kind: detected.report.kind,
        verdict: detected.report.verdict,
        fields: detected.report.fields,
        freshness: detected.report.freshness,
        claims: detected.report.claims,
        summary: detected.report.summary,
        ...compactPageChange(detected.report, requested.keys),
      };
      const job = detected.envelope.job;
      if (job && typeof job === "object") pageChange.jobId = job.id ?? null;
      Object.assign(payload, walk(pageChange, ""));
    } else if (detected.kind === "extract_batch") {
      Object.assign(payload, walk(compactExtractBatch(detected.envelope, requested.keys), ""));
    } else if (detected.kind === "explicit_record") {
      Object.assign(payload, walk(compactRecord(detected.envelope, requested.keys), ""));
    } else if (detected.kind === "n45_page_change_result") {
      Object.assign(payload, walk(compactN45(detected.envelope, requested.keys), ""));
    }
  } catch {
    return { ok: false, message: "recognized result has invalid bounded structure" };
  }

  const payloadBound = checkPayloadBytes(payload);
  if (!payloadBound.ok) return payloadBound;
  payload.contentHash = sha256Json(payloadWithoutHash(payload));
  return {
    ok: true,
    kind: detected.kind,
    incomplete: isIncomplete(detected),
    payload,
    omitted: uniqueOmitted(omitted),
    included: unique(Object.keys(payload)),
  };
}

function normalizeSelect(select) {
  const keys = new Set(DEFAULT_SELECT);
  for (const raw of select) {
    const key = String(raw).trim();
    if (!key) continue;
    if (isForbiddenKey(key)) {
      return { ok: false, message: "refusing forbidden selection" };
    }
    if (!SELECTABLE.includes(key)) {
      return { ok: false, message: "selection is not on the reviewed allowlist" };
    }
    keys.add(key);
  }
  return { ok: true, keys };
}

function compactPageChange(report, selected) {
  const out = {};
  if (selected.has("rows")) {
    out.rows = {
      matched: (report.rows?.matched || []).map(compactRow),
      missing: (report.rows?.missing || []).map(compactRow),
      failed: (report.rows?.failed || []).map(compactFailedRow),
    };
  }
  if (selected.has("coverageUnknown")) {
    out.coverageUnknown = (report.coverageUnknown || []).map((row) => ({
      sourceKey: publicOrOmit(row.sourceKey),
      field: row.field,
      reason: row.reason,
    }));
  }
  if (selected.has("changes") || selected.has("evidence")) {
    out.changes = (report.changes || []).map((row) => {
      const item = {
        class: row.class,
        op: row.op,
        path: row.path,
        sourceKey: publicOrOmit(row.sourceKey),
      };
      if (selected.has("evidence")) {
        item.before = row.before;
        item.after = row.after;
      }
      return item;
    });
  }
  return out;
}

function compactExtractBatch(envelope, selected) {
  const out = {
    product: envelope.product,
    schemaVersion: envelope.schemaVersion,
    jobId: envelope.jobId,
    jobStatus: envelope.jobStatus,
    partial: envelope.partial,
    ok: envelope.ok,
  };
  if (selected.has("sources") || selected.has("jsonLd") || selected.has("description") || selected.has("title")) {
    out.sources = (envelope.sources || []).map((row) => {
      const item = {
        id: row.id,
        source: publicOrOmit(row.source || row.finalUrl),
        status: row.status,
        httpStatus: row.httpStatus,
        error: row.error ? { code: row.error.code } : null,
      };
      if (row.data && typeof row.data === "object") {
        if (selected.has("title") && row.data.title != null) item.title = row.data.title;
        if (selected.has("description") && row.data.description != null) item.description = row.data.description;
        if (selected.has("jsonLd") && row.data.jsonLd != null) item.jsonLd = row.data.jsonLd;
      }
      return item;
    });
  }
  return out;
}

function compactRecord(envelope, selected) {
  const out = {
    status: envelope.status,
    ok: envelope.ok,
    networkUsed: envelope.networkUsed,
  };
  if (selected.has("records")) {
    out.records = (envelope.records || []).map(compactRecordRow);
  }
  if (selected.has("invalidRecords")) {
    out.invalidRecords = (envelope.invalidRecords || []).map((row) => ({
      status: row.status,
      missing: row.missing,
    }));
  }
  return out;
}

function compactN45(envelope) {
  return {
    schema: envelope.schema,
    url: publicOrOmit(envelope.url),
    status: envelope.status,
    title: envelope.title,
    sourceContentHash: envelope.contentHash,
    bytes: envelope.bytes,
    fetchedAt: envelope.fetchedAt,
    sourceResultAssertions: {
      originMarkedPublicSafe: envelope.publicSafe === true,
      originMarkedCredentialFree: envelope.credentials === false,
      originMarkedNoLiveParticipant: envelope.liveParticipant === false,
      originMarkedNoPayment: envelope.payment === false,
    },
  };
}

function compactRow(row) {
  return {
    sourceKey: publicOrOmit(row.sourceKey || row.source),
    status: row.status ?? row.after?.status ?? row.before?.status ?? null,
    missingSide: row.missingSide,
  };
}

function compactFailedRow(row) {
  return {
    sourceKey: publicOrOmit(row.sourceKey || row.source),
    beforeStatus: row.before?.status ?? null,
    afterStatus: row.after?.status ?? null,
    errorCode: row.after?.error?.code ?? row.before?.error?.code ?? null,
  };
}

function compactRecordRow(row) {
  return {
    status: row.status,
    source: publicOrOmit(row.source),
  };
}

function scrub(value, path, omitted) {
  if (value == null) return value;
  if (typeof value === "string") {
    const hits = credentialHits(value);
    if (hits.length) {
      omitted.push({ path: path || "(string)", reason: "credential_shape" });
      return "[omitted]";
    }
    if (containsHostileMarkup(value)) {
      omitted.push({ path: path || "(string)", reason: "hostile_markup" });
      return "[omitted]";
    }
    if (looksLikeFilesystemPath(value)) {
      omitted.push({ path: path || "(string)", reason: "filesystem_path" });
      return "[omitted]";
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item, index) => scrub(item, `${path}/${index}`, omitted));
  }
  if (typeof value === "object") {
    const out = {};
    for (const [key, child] of Object.entries(value)) {
      if (credentialHits(key).length || containsHostileMarkup(key) || looksLikeFilesystemPath(key)) {
        omitted.push({ path: joinPath(path, "(key)"), reason: "credential_shape" });
        continue;
      }
      if (isForbiddenKey(key)) {
        omitted.push({ path: joinPath(path, safePathSegment(key)), reason: "forbidden_key" });
        continue;
      }
      if (key === "path" && looksLikeFilesystemPath(child)) {
        omitted.push({ path: joinPath(path, "path"), reason: "filesystem_path" });
        continue;
      }
      const next = scrub(child, joinPath(path, safePathSegment(key)), omitted);
      if (next !== undefined) {
        out[key] = next;
      }
    }
    return out;
  }
  return value;
}

function isIncomplete(detected) {
  if (detected.kind === "extract_batch") {
    return Boolean(detected.envelope.partial) || detected.envelope.jobStatus !== "completed";
  }
  if (detected.kind === "page_change_brief") {
    if (typeof detected.report.claims?.complete === "boolean") {
      return detected.report.claims.complete === false;
    }
    const summary = detected.report.summary || {};
    return ["missing", "failed", "unknown", "coverageUnknown"]
      .some((key) => Number(summary[key] || 0) > 0);
  }
  if (detected.kind === "explicit_record") {
    return detected.envelope.status !== "ok" && detected.envelope.status !== "success";
  }
  return false;
}

function publicOrOmit(value) {
  return isPublicHttpUrl(value) ? value : null;
}

function joinPath(path, key) {
  return path ? `${path}/${key}` : key;
}

function safePathSegment(key) {
  const text = String(key);
  return /^[A-Za-z0-9_.-]{1,64}$/.test(text) && credentialHits(text).length === 0
    ? text
    : "(key)";
}

function uniqueOmitted(items) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const id = `${item.path}:${item.reason}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(item);
  }
  return out;
}

function unique(items) {
  return [...new Set(items)];
}

function payloadWithoutHash(payload) {
  const copy = { ...payload };
  delete copy.contentHash;
  return copy;
}
