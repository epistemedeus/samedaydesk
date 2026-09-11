export const REFUSE_CODES = new Set([
  "live_fetch_url",
  "payment_retry",
  "quote_as_success",
  "sample_as_delivered_watch",
  "clock_required",
  "integer_terms_version",
  "fields_required",
  "unsupported_field",
  "input_bounds",
  "unrecognized_batch_artifact",
  "usage",
]);

function parseJsonMaybe(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

export function parseRefuse(stderr) {
  const parsed = parseJsonMaybe(stderr);
  if (!parsed || parsed.ok !== false || typeof parsed.code !== "string") return null;
  return { code: parsed.code, message: parsed.message || parsed.error || parsed.code };
}

export function parseStdoutEnvelope(stdout) {
  return parseJsonMaybe(stdout);
}

export function classifySpawn({ error, status, stdout, stderr, jsonExists }) {
  if (error) {
    return {
      kind: "transport_failure",
      code: error.code || "spawn_error",
      message: error.message,
      exitCode: null,
    };
  }

  const refuse = parseRefuse(stderr);
  if (status !== 0) {
    if (refuse && REFUSE_CODES.has(refuse.code)) {
      return {
        kind: "valid_refusal",
        code: refuse.code,
        message: refuse.message,
        exitCode: status,
      };
    }
    return {
      kind: "engine_failure",
      code: refuse?.code || "engine_nonzero",
      message: refuse?.message || String(stderr || "").trim() || `engine exit ${status}`,
      exitCode: status,
    };
  }

  const envelope = parseStdoutEnvelope(stdout);
  if (!jsonExists) {
    return {
      kind: "delivery_failure",
      code: "missing_page_change_json",
      message: "engine exited 0 but page-change.json was not written",
      exitCode: status,
    };
  }
  if (!envelope || envelope.ok !== true) {
    return {
      kind: "engine_failure",
      code: "stdout_not_ok",
      message: "engine exited 0 but stdout was not an ok envelope",
      exitCode: status,
    };
  }

  return {
    kind: "valid_analysis",
    code: "ok",
    message: "engine delivered page-change.json",
    exitCode: status,
    envelope,
  };
}
