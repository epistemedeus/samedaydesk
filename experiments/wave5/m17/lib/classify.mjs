export function parseCliJson(stdout) {
  const text = String(stdout || "").trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

/**
 * Separate engine/transport failure from a valid Co12 analysis outcome.
 * Digest inequality is recorded, never treated as a compatibility break by itself.
 */
export function classifyEngineResult(spawned) {
  if (spawned.missingEngine) {
    return { kind: "incomplete", reason: "m04-engine-missing", code: null };
  }
  if (spawned.error && spawned.error.code === "ENOENT") {
    return { kind: "incomplete", reason: "m04-engine-missing", code: null };
  }
  if (spawned.signal || spawned.status === null) {
    return { kind: "engine_failure", reason: spawned.signal || "no-exit", code: null };
  }
  const body = spawned.json || parseCliJson(spawned.stdout);
  if (!body || typeof body !== "object") {
    return { kind: "engine_failure", reason: "non-json-stdout", code: null };
  }
  if (body.ok === false && body.refused === true) {
    if (body.code === "http_catalog_failed") {
      return { kind: "transport_failure", reason: body.error || body.code, code: body.code };
    }
    return { kind: "analysis_refusal", reason: body.error || body.code, code: body.code };
  }
  if (body.ok === true) {
    const counts = body.counts || {};
    const semantic =
      Number(counts.added || 0) + Number(counts.removed || 0) + Number(counts.changed || 0);
    const digest = body.tableDigest || null;
    const digestChanged = Boolean(
      digest && digest.before && digest.after && digest.before !== digest.after,
    );
    if (semantic === 0) {
      return {
        kind: "analysis_no_change",
        reason: digestChanged
          ? "order-only digest change is not a route compatibility break"
          : "identical semantic route table",
        code: null,
        titleOnly: Number(counts.titleOnly || 0),
        digestChanged,
      };
    }
    return { kind: "analysis_change", reason: "added, removed, or canonical/robots change", code: null };
  }
  return { kind: "engine_failure", reason: "unexpected-shape", code: null };
}

export function isIncomplete(classification) {
  return classification.kind === "incomplete";
}

export function isEngineOrTransportFailure(classification) {
  return classification.kind === "engine_failure" || classification.kind === "transport_failure";
}
