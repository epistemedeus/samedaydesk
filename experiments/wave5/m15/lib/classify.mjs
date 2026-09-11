export const ANALYSIS_REFUSE_CODES = Object.freeze(
  new Set([
    "remote-ref-refused",
    "missing-required-inputs",
    "invalid_input",
    "not-this-job-openapi",
    "html-or-markup",
    "not-json",
    "kind-mismatch",
    "unreadable-input",
    "parse-error",
    "not-object-or-value",
    "missing-used-list",
    "invalid-document",
  ]),
);

export function parseEngineStdout(stdout) {
  const text = String(stdout || "").trim();
  if (!text) return { ok: false, reason: "empty-stdout", value: null };
  try {
    return { ok: true, reason: "json", value: JSON.parse(text) };
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return { ok: true, reason: "json-slice", value: JSON.parse(text.slice(start, end + 1)) };
      } catch {
        return { ok: false, reason: "non-json-stdout", value: null };
      }
    }
    return { ok: false, reason: "non-json-stdout", value: null };
  }
}

export function classifyInvocation({
  spawnError = null,
  timedOut = false,
  exitCode = null,
  stdout = "",
  stderr = "",
  outputJsonExists = false,
  outputMdExists = false,
} = {}) {
  if (spawnError) {
    return {
      kind: "transport-failure",
      analysisStatus: null,
      refuseCode: null,
      reason: "spawn-error",
      engineOk: false,
      exitCode,
      parsed: null,
    };
  }
  if (timedOut) {
    return {
      kind: "transport-failure",
      analysisStatus: null,
      refuseCode: null,
      reason: "timeout",
      engineOk: false,
      exitCode,
      parsed: null,
    };
  }

  const parsed = parseEngineStdout(stdout);
  if (!parsed.ok) {
    return {
      kind: "engine-failure",
      analysisStatus: null,
      refuseCode: null,
      reason: parsed.reason,
      engineOk: false,
      exitCode,
      parsed: null,
      stderr: stderr || null,
    };
  }

  const payload = parsed.value;
  if (payload && payload.ok === true) {
    if (!outputJsonExists || !outputMdExists) {
      return {
        kind: "engine-failure",
        analysisStatus: payload.status || null,
        refuseCode: null,
        reason: "missing-outputs",
        engineOk: false,
        exitCode,
        parsed: payload,
      };
    }
    return {
      kind: "analysis",
      analysisStatus: payload.status || "informational",
      refuseCode: null,
      reason: "ok",
      engineOk: true,
      exitCode,
      parsed: payload,
    };
  }

  if (payload && payload.code === "internal-error") {
    return {
      kind: "engine-failure",
      analysisStatus: null,
      refuseCode: payload.code,
      reason: "internal-error",
      engineOk: false,
      exitCode,
      parsed: payload,
    };
  }

  if (payload && payload.refused === true) {
    const code = payload.code || "refused";
    return {
      kind: "analysis",
      analysisStatus: "refused",
      refuseCode: code,
      reason: ANALYSIS_REFUSE_CODES.has(code) ? "documented-refuse" : "refused",
      engineOk: false,
      exitCode,
      parsed: payload,
    };
  }

  return {
    kind: "engine-failure",
    analysisStatus: null,
    refuseCode: payload?.code || null,
    reason: "unclassified-engine-result",
    engineOk: false,
    exitCode,
    parsed: payload,
  };
}

export function trialExecutionOk(classified) {
  return classified.kind === "analysis";
}
