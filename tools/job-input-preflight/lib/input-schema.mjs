import {
  EVIDENCE_PACKET_SCHEMA,
  LISTING_REPAIR_INPUT_SCHEMA,
  NEXT_RUN_MANIFEST_SCHEMAS,
} from "./constants.mjs";
import { parseJsonDocument } from "./jsonl.mjs";
import { refuse } from "./refuse.mjs";

function requireJsonObject(text, { key, jobId }) {
  const parsed = parseJsonDocument(text);
  if (parsed.jsonl) {
    throw refuse("input-jsonl-not-document", "JSONL is not this job's input document", {
      key,
      job: jobId,
    });
  }
  if (!parsed.ok) {
    throw refuse("input-malformed-json", "JSON input is not valid JSON", {
      key,
      job: jobId,
      error: String(parsed.error?.message || parsed.error || "parse failed"),
    });
  }
  if (parsed.value == null || typeof parsed.value !== "object" || Array.isArray(parsed.value)) {
    throw refuse("input-schema-mismatch", "JSON input must be an object", { key, job: jobId });
  }
  return parsed.value;
}

function validatePricingRows(json, key) {
  if (!Array.isArray(json.rows)) {
    throw refuse(
      "input-schema-mismatch",
      "vendor-budget-impact input must be a JSON object with a rows array",
      { key },
    );
  }
  json.rows.forEach((row, index) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      throw refuse("input-schema-mismatch", "pricing row must be an object", { key, index });
    }
    if (typeof row.field !== "string" || !row.field) {
      throw refuse("input-schema-mismatch", "pricing row.field must be a non-empty string", {
        key,
        index,
      });
    }
    if (typeof row.value !== "number" || !Number.isFinite(row.value)) {
      throw refuse("input-schema-mismatch", "pricing row.value must be a finite number", {
        key,
        index,
      });
    }
    if (typeof row.unit !== "string" || !row.unit) {
      throw refuse("input-schema-mismatch", "pricing row.unit must be a non-empty string", {
        key,
        index,
      });
    }
  });
}

/**
 * Validate staged bytes against the catalog job's input family.
 * Syntax-only JSON.parse is not a schema check. Does not copy kit engines.
 */
export function validateStagedInput(job, key, buffer) {
  const jobId = job.id;
  const text = buffer.toString("utf8");

  if (key === "input-root") {
    return { encoding: "directory" };
  }

  if (jobId === "feed-agenda") {
    const parsed = parseJsonDocument(text);
    if (parsed.jsonl) {
      throw refuse("input-jsonl-not-document", "JSONL is not a feed-agenda RSS/Atom document", {
        key,
        job: jobId,
      });
    }
    if (parsed.ok) {
      throw refuse("input-schema-mismatch", "feed-agenda expects RSS/Atom XML, not JSON", {
        key,
        job: jobId,
      });
    }
    if (!text.trim().startsWith("<")) {
      throw refuse("input-schema-mismatch", "feed-agenda expects RSS/Atom XML", { key, job: jobId });
    }
    return { encoding: "xml", json: false };
  }

  if (jobId === "api-upgrade-brief") {
    if (key === "used") {
      requireJsonObject(text, { key, jobId });
      return { encoding: "json", json: true };
    }
    const parsed = parseJsonDocument(text);
    if (parsed.jsonl) {
      throw refuse("input-jsonl-not-document", "JSONL is not an OpenAPI document", { key, job: jobId });
    }
    if (parsed.ok) return { encoding: "json", json: true };
    if (!text.trim()) {
      throw refuse("input-schema-mismatch", "OpenAPI input is empty", { key, job: jobId });
    }
    return { encoding: "yaml", json: false };
  }

  const json = requireJsonObject(text, { key, jobId });

  if (jobId === "vendor-budget-impact") {
    validatePricingRows(json, key);
    return { encoding: "json", json: true };
  }
  if (jobId === "evidence-ci-annotation") {
    if (json.schema !== EVIDENCE_PACKET_SCHEMA) {
      throw refuse("input-schema-mismatch", `evidence packet schema must be ${EVIDENCE_PACKET_SCHEMA}`, {
        key,
        job: jobId,
        got: json.schema ?? null,
      });
    }
    return { encoding: "json", json: true };
  }
  if (jobId === "listing-repair-packet") {
    if (json.schema !== LISTING_REPAIR_INPUT_SCHEMA) {
      throw refuse(
        "input-schema-mismatch",
        `listing repair schema must be ${LISTING_REPAIR_INPUT_SCHEMA}`,
        { key, job: jobId, got: json.schema ?? null },
      );
    }
    return { encoding: "json", json: true };
  }
  if (jobId === "repeat-job-record" && key === "next-run") {
    if (!NEXT_RUN_MANIFEST_SCHEMAS.includes(json.schema)) {
      throw refuse(
        "input-schema-mismatch",
        "next-run schema must be s176.next-run-manifest.v1 or s163.next-run-manifest.v1",
        { key, job: jobId, got: json.schema ?? null },
      );
    }
    return { encoding: "json", json: true };
  }

  return { encoding: "json", json: true };
}
