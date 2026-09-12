export function parseJsonPayload(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function hasKeys(obj, keys) {
  if (!obj || typeof obj !== "object") return false;
  return keys.every((key) => Object.prototype.hasOwnProperty.call(obj, key));
}

export function readByPath(obj, path) {
  if (!path) return obj;
  return String(path)
    .split(".")
    .reduce((cur, key) => (cur == null ? undefined : cur[key]), obj);
}

export function streamText(spawnResult, stream) {
  if (stream === "stderr") return spawnResult.stderr || "";
  return spawnResult.stdout || "";
}

export function isRefuse(engine, spawnResult, refuseDoc) {
  const spec = engine.refuse;
  if (!refuseDoc || typeof refuseDoc !== "object") return false;
  if (spec.ok === false && refuseDoc.ok !== false) return false;
  if (spec.refused === true && refuseDoc.refused !== true) return false;
  if (!hasKeys(refuseDoc, spec.requiredKeys)) return false;
  if (typeof spawnResult.status === "number" && spawnResult.status === 0) return false;
  return true;
}

export function isAnalysis(engine, spawnResult, stdoutDoc) {
  if (spawnResult.status !== 0) return false;
  if (!stdoutDoc || stdoutDoc.ok !== true) return false;
  return hasKeys(stdoutDoc, engine.stdout.requiredKeys);
}

export function analysisValue(engine, stdoutDoc, outputJson) {
  const field = engine.analysisField;
  if (field === "counts") {
    const counts = stdoutDoc.counts || outputJson?.counts;
    return counts || null;
  }
  return readByPath(stdoutDoc, field);
}

export function classifyInvocation({ engine, spawnResult, stdoutDoc, refuseDoc, missingOutputs }) {
  if (isRefuse(engine, spawnResult, refuseDoc)) {
    return {
      kind: "refused",
      transportOk: true,
      code: refuseDoc.code,
      analysis: null,
    };
  }
  if (isAnalysis(engine, spawnResult, stdoutDoc)) {
    if (missingOutputs.length) {
      return {
        kind: "incomplete-delivery",
        transportOk: true,
        code: "missing-promised-output",
        analysis: analysisValue(engine, stdoutDoc, null),
      };
    }
    return {
      kind: "analysis",
      transportOk: true,
      code: null,
      analysis: analysisValue(engine, stdoutDoc, null),
    };
  }
  return {
    kind: "transport-failure",
    transportOk: false,
    code: stdoutDoc?.code || refuseDoc?.code || "non-json-or-crash",
    analysis: null,
  };
}
