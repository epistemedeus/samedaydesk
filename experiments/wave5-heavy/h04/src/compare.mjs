import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

function readText(file) {
  return readFileSync(file, "utf8");
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function loadExpectedFile(expectedPath) {
  if (!expectedPath || !existsSync(expectedPath)) return null;
  try {
    return readJson(expectedPath);
  } catch {
    return { __parseError: true, path: expectedPath };
  }
}

/**
 * Resolve the oracle object. Missing expected stays missing (unknown).
 */
export function resolveExpected({ expected, expectedPath, example } = {}) {
  if (expected && typeof expected === "object") return expected;
  const fromFile = loadExpectedFile(expectedPath);
  if (fromFile) return fromFile;
  if (example && typeof example === "object") {
    const status = example.expectedStatus ?? example.status;
    const verdict = example.expectedVerdict ?? example.verdict;
    const highlights = example.expectedHighlights ?? example.highlights;
    if (status != null || verdict != null || highlights != null) {
      return { status, verdict, highlights };
    }
  }
  return null;
}

function pickString(obj, keys) {
  for (const key of keys) {
    const value = obj?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function walkStatus(obj, depth = 0) {
  if (!isPlainObject(obj) || depth > 4) return undefined;
  const direct = pickString(obj, ["status", "verdict"]);
  if (typeof obj.status === "string" && obj.status.trim()) return obj.status.trim();
  for (const key of ["engine", "receipt", "report", "body"]) {
    const nested = walkStatus(obj[key], depth + 1);
    if (nested) return nested;
  }
  return direct === undefined ? undefined : direct;
}

function walkVerdict(obj, depth = 0) {
  if (!isPlainObject(obj) || depth > 4) return undefined;
  if (typeof obj.verdict === "string" && obj.verdict.trim()) return obj.verdict.trim();
  for (const key of ["engine", "receipt", "report", "body"]) {
    const nested = walkVerdict(obj[key], depth + 1);
    if (nested) return nested;
  }
  return undefined;
}

function presence(value) {
  if (value == null) return null;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value > 0;
  if (typeof value === "string") return value.length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (isPlainObject(value) && typeof value.length === "number") return value.length > 0;
  return null;
}

function highlightList(expected) {
  if (!expected) return [];
  if (Array.isArray(expected.highlights)) return expected.highlights.filter((h) => typeof h === "string");
  if (Array.isArray(expected.expectedHighlights)) {
    return expected.expectedHighlights.filter((h) => typeof h === "string");
  }
  if (isPlainObject(expected.highlights)) {
    return Object.entries(expected.highlights)
      .filter(([, v]) => v === true)
      .map(([k]) => k);
  }
  return [];
}

function collectJsonAndMd(outDir) {
  const files = [];
  if (!outDir || !existsSync(outDir)) return files;
  let ents;
  try {
    ents = readdirSync(outDir, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const ent of ents) {
    if (!ent.isFile()) continue;
    const name = ent.name;
    if (!name.endsWith(".json") && !name.endsWith(".md") && !name.endsWith(".txt")) continue;
    try {
      files.push({ name, text: readText(join(outDir, name)) });
    } catch {
      /* skip unreadable */
    }
  }
  return files;
}

export function parseJsonLoose(text) {
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

export function extractFactsFromObject(obj) {
  if (!isPlainObject(obj)) return {};
  const facts = {};
  const status = walkStatus(obj);
  const verdict = walkVerdict(obj);
  if (status !== undefined) facts.status = status;
  if (verdict !== undefined) facts.verdict = verdict;
  if (typeof obj.ok === "boolean") facts.ok = obj.ok;
  if (typeof obj.sample === "boolean") facts.sample = obj.sample;
  const impact = isPlainObject(obj.impact) ? obj.impact : obj;
  const highlights = {};
  for (const key of ["breaking", "added", "deleted", "removed", "changed", "unknown"]) {
    const p = presence(impact[key]);
    if (p != null) highlights[key] = p;
  }
  if (Object.keys(highlights).length) facts.highlightPresence = highlights;
  return facts;
}

export function collectEngineArtifacts({ outDir, stdout = "", stderr = "" } = {}) {
  const files = collectJsonAndMd(outDir);
  const objects = [];
  const haystackParts = [stdout || ""];
  const stdoutObj = parseJsonLoose(stdout);
  if (stdoutObj) objects.push(stdoutObj);
  for (const file of files) {
    haystackParts.push(file.text);
    if (file.name.endsWith(".json")) {
      const obj = parseJsonLoose(file.text);
      if (obj) objects.push(obj);
    }
  }
  const facts = {};
  for (const obj of objects) {
    const extracted = extractFactsFromObject(obj);
    for (const [k, v] of Object.entries(extracted)) {
      if (facts[k] === undefined) facts[k] = v;
      else if (k === "highlightPresence" && isPlainObject(facts[k]) && isPlainObject(v)) {
        facts[k] = { ...v, ...facts[k] };
      }
    }
  }
  return {
    facts,
    haystack: haystackParts.join("\n"),
    objects,
    files: files.map((f) => f.name),
    stderr: stderr || "",
  };
}

function normalizeStatus(value) {
  const v = String(value).trim().toLowerCase();
  if (["unchanged", "informational", "no-change", "no_change", "none"].includes(v)) return "no-change";
  if (["actionable", "changed", "breaking", "delta"].includes(v)) return "changed";
  if (["partial", "incomplete"].includes(v)) return "partial";
  if (["ok", "success", "succeeded"].includes(v)) return "ok";
  return v;
}

function factResult(expectedValue, actualValue, { statusLike = false } = {}) {
  if (expectedValue === undefined || expectedValue === null) return "unknown";
  if (actualValue === undefined || actualValue === null) return "unknown";
  if (statusLike && typeof expectedValue === "string" && typeof actualValue === "string") {
    if (normalizeStatus(expectedValue) === normalizeStatus(actualValue)) return "match";
  }
  const exp = typeof expectedValue === "string" ? expectedValue.trim().toLowerCase() : expectedValue;
  const act = typeof actualValue === "string" ? actualValue.trim().toLowerCase() : actualValue;
  if (exp === act) return "match";
  return "mismatch";
}

function highlightPresent(haystack, needle) {
  if (!needle) return null;
  if (!haystack || !haystack.trim()) return null;
  if (haystack.includes(needle)) return true;
  const tokens = String(needle)
    .split(/[^A-Za-z0-9_./{}-]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
  if (tokens.length < 2) return false;
  return tokens.every((t) => haystack.includes(t));
}

function overallOf(results) {
  if (results.includes("mismatch")) return "mismatch";
  if (results.length === 0) return "unknown";
  if (results.every((r) => r === "match")) return "match";
  if (results.every((r) => r === "unknown")) return "unknown";
  if (results.includes("unknown")) return "unknown";
  return "match";
}

/**
 * Compare engine artifacts vs expected-report.json at fact level.
 * Records match | mismatch | unknown. Does not invent a pass.
 */
export function compareRun({
  expected = undefined,
  expectedPath = undefined,
  example = undefined,
  outDir = undefined,
  stdout = "",
  stderr = "",
  exitCode = undefined,
} = {}) {
  const oracle = resolveExpected({ expected, expectedPath, example });
  const facts = [];

  if (!oracle) {
    return {
      result: "unknown",
      reason: "expected-report-missing",
      facts,
      expectedPresent: false,
    };
  }
  if (oracle.__parseError) {
    return {
      result: "unknown",
      reason: "expected-report-unreadable",
      facts,
      expectedPresent: true,
    };
  }

  const artifacts = collectEngineArtifacts({ outDir, stdout, stderr });
  const expectedStatus = oracle.status ?? oracle.expectedStatus ?? oracle.verdict;
  const expectedVerdict = oracle.verdict ?? oracle.expectedVerdict;
  const statusKey = oracle.status != null || oracle.expectedStatus != null ? "status" : null;
  const verdictKey = oracle.verdict != null || oracle.expectedVerdict != null ? "verdict" : null;

  if (statusKey) {
    let actual = artifacts.facts.status ?? artifacts.facts.verdict;
    if (
      actual == null &&
      typeof expectedStatus === "string" &&
      normalizeStatus(expectedStatus) === "ok" &&
      artifacts.facts.ok === true
    ) {
      actual = "ok";
    }
    facts.push({
      key: "status",
      expected: expectedStatus,
      actual: actual ?? null,
      result: factResult(expectedStatus, actual, { statusLike: true }),
    });
  }
  if (verdictKey && (oracle.verdict != null || oracle.expectedVerdict != null)) {
    const actual = artifacts.facts.verdict ?? artifacts.facts.status;
    facts.push({
      key: "verdict",
      expected: expectedVerdict,
      actual: actual ?? null,
      result: factResult(expectedVerdict, actual, { statusLike: true }),
    });
  }

  const needles = highlightList(oracle);
  const haystack = artifacts.haystack || "";
  for (const needle of needles) {
    if (!needle) continue;
    let result = "unknown";
    let actual = null;
    const present = highlightPresent(haystack, needle);
    if (present == null) {
      result = "unknown";
    } else {
      actual = present;
      result = present ? "match" : "mismatch";
    }
    facts.push({
      key: `highlight:${needle}`,
      expected: needle,
      actual,
      result,
    });
  }

  if (isPlainObject(oracle.highlights) && !Array.isArray(oracle.highlights)) {
    const presenceMap = artifacts.facts.highlightPresence || {};
    for (const [key, want] of Object.entries(oracle.highlights)) {
      if (typeof want !== "boolean") continue;
      const actual = presenceMap[key];
      facts.push({
        key: `highlightPresence.${key}`,
        expected: want,
        actual: actual ?? null,
        result: factResult(want, actual),
      });
    }
  }

  if (typeof oracle.ok === "boolean") {
    facts.push({
      key: "ok",
      expected: oracle.ok,
      actual: artifacts.facts.ok ?? null,
      result: factResult(oracle.ok, artifacts.facts.ok),
    });
  }

  // Refused/crashed/missing artifacts: do not invent a pass.
  if ((exitCode !== 0 && exitCode !== undefined && exitCode !== null) || !haystack.trim()) {
    for (const fact of facts) {
      if (fact.result === "mismatch" && (fact.actual === null || fact.actual === undefined || fact.actual === false)) {
        if (fact.key.startsWith("highlight") && fact.actual === false && haystack.trim()) continue;
        if (fact.actual === null || fact.actual === undefined) fact.result = "unknown";
      }
    }
  }

  const result = overallOf(facts.map((f) => f.result));
  return {
    result,
    reason: result === "unknown" && facts.length === 0 ? "no-comparable-facts" : null,
    facts,
    expectedPresent: true,
    artifactFiles: artifacts.files,
  };
}
