import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

function readArtifact(outDir, outputs = []) {
  if (!outDir) return null;
  const jsonName = (outputs || []).find((n) => String(n).endsWith(".json"));
  if (!jsonName) return null;
  const path = join(outDir, jsonName);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

/**
 * Distinguish wrapper transport from analysis outcome.
 * A valid no-change or SAMPLE refusal is not an engine crash.
 */
export function classifyRun({ wrapper, artifact, sample = false }) {
  const parsed = wrapper?.json;
  if (parsed == null) {
    return {
      transportOk: false,
      analysis: "failed",
      independentlyValidCaller: false,
      code: "wrapper-unreadable",
      error: wrapper?.stderr || "wrapper produced no JSON",
    };
  }

  const labelledSample = sample || parsed.sample === true;
  if (labelledSample) {
    return {
      transportOk: true,
      analysis: "sample",
      independentlyValidCaller: false,
      code: parsed.code || (parsed.ok ? "labeled-sample" : parsed.code),
      error: parsed.error || null,
    };
  }

  if (parsed.ok === false || parsed.refused === true) {
    return {
      transportOk: true,
      analysis: "refused",
      independentlyValidCaller: false,
      code: parsed.code || "engine-refused",
      error: parsed.error || null,
    };
  }

  const outputs = parsed.outputs || [];
  const missing = (parsed.receipt?.outputs || outputs).length === 0;
  if (missing) {
    return {
      transportOk: true,
      analysis: "failed",
      independentlyValidCaller: false,
      code: "missing-outputs",
      error: "wrapper claimed success without delivered artifacts",
    };
  }

  const status = artifact?.status || parsed.engine?.status || null;
  if (status === "informational") {
    return {
      transportOk: true,
      analysis: "no-change",
      independentlyValidCaller: true,
      code: null,
      error: null,
    };
  }
  if (status === "refused") {
    return {
      transportOk: true,
      analysis: "refused",
      independentlyValidCaller: true,
      code: "engine-refused",
      error: parsed.error || null,
    };
  }
  return {
    transportOk: true,
    analysis: "delivered",
    independentlyValidCaller: true,
    code: null,
    error: null,
  };
}

export function loadCaseArtifact(outDir, outputs) {
  return readArtifact(outDir, outputs);
}
