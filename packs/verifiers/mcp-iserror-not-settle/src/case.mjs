import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { classifyCase, isPlainObject } from "./classify.mjs";
import { CASE_SCHEMA, CODES, PACK_ID } from "./rules.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const PACK_ROOT = join(HERE, "..");
export const FIXTURES_ROOT = join(PACK_ROOT, "fixtures");
export const PASS_DIR = join(FIXTURES_ROOT, "pass");
export const FAIL_DIR = join(FIXTURES_ROOT, "fail");

export function listJsonFiles(dir) {
  const names = readdirSync(dir).filter((name) => extname(name) === ".json").sort();
  return names.map((name) => join(dir, name));
}

export function loadJson(filePath) {
  const raw = readFileSync(filePath, "utf8");
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`${filePath}: invalid JSON (${error.message})`);
  }
}

export function resolveCasePath(filePath, cwd = process.cwd()) {
  return isAbsolute(filePath) ? filePath : join(cwd, filePath);
}

export function normalizeCase(raw, { filePath } = {}) {
  if (!isPlainObject(raw)) {
    return {
      ok: false,
      code: CODES.MALFORMED_CASE,
      error: "case must be a JSON object",
      filePath,
    };
  }

  const id =
    typeof raw.id === "string" && raw.id
      ? raw.id
      : filePath
        ? filePath.split("/").pop().replace(/\.json$/, "")
        : "anonymous";

  const expect =
    raw.expect === "reject" || raw.expect === "pass" || raw.expect === "not_proven"
      ? raw.expect
      : undefined;

  return {
    ok: true,
    case: {
      schema: raw.schema ?? CASE_SCHEMA,
      id,
      expect,
      http: raw.http,
      rpc: pickRpc(raw),
      claim: raw.claim,
      notes: raw.notes,
    },
    filePath,
  };
}

function pickRpc(raw) {
  for (const key of ["rpc", "jsonrpc", "body", "message"]) {
    const value = raw[key];
    if (isPlainObject(value) || Array.isArray(value)) return value;
  }
  if (raw.jsonrpc === "2.0" || Object.hasOwn(raw, "result") || Object.hasOwn(raw, "error")) {
    return raw;
  }
  return undefined;
}

export function evaluateFile(filePath) {
  let raw;
  try {
    raw = loadJson(filePath);
  } catch (error) {
    return {
      pack: PACK_ID,
      filePath,
      ok: false,
      verdict: "reject",
      code: CODES.MALFORMED_CASE,
      error: error.message,
    };
  }
  const loaded = normalizeCase(raw, { filePath });
  if (!loaded.ok) {
    return {
      pack: PACK_ID,
      filePath,
      id: null,
      ok: false,
      verdict: "reject",
      code: loaded.code,
      error: loaded.error,
    };
  }
  const result = classifyCase({
    http: loaded.case.http,
    rpc: loaded.case.rpc,
    claim: loaded.case.claim,
    jsonrpc: loaded.case.rpc,
  });
  return {
    pack: PACK_ID,
    filePath,
    id: loaded.case.id,
    expect: loaded.case.expect,
    ...result,
  };
}

export function fixtureKindFromPath(filePath) {
  const normalized = filePath.replaceAll("\\", "/");
  if (normalized.includes("/fixtures/fail/")) return "fail";
  if (normalized.includes("/fixtures/pass/")) return "pass";
  return "caller";
}

export function expectedVerdictForFile(filePath, loadedExpect) {
  if (loadedExpect) return loadedExpect;
  const kind = fixtureKindFromPath(filePath);
  if (kind === "fail") return "reject";
  if (kind === "pass") return "pass";
  return null;
}

export function fileMatchesExpectation(report) {
  const expected = expectedVerdictForFile(report.filePath, report.expect);
  if (!expected) return report.ok && report.verdict !== "reject";
  if (expected === "reject") return report.verdict === "reject" && report.ok === false;
  if (expected === "pass") return report.verdict === "pass" && report.ok === true;
  if (expected === "not_proven") return report.verdict === "not_proven" && report.ok === true;
  return false;
}

export function assertFixturesPresent() {
  for (const dir of [PASS_DIR, FAIL_DIR]) {
    if (!statSync(dir).isDirectory()) {
      throw new Error(`missing fixtures directory: ${dir}`);
    }
  }
  const pass = listJsonFiles(PASS_DIR);
  const fail = listJsonFiles(FAIL_DIR);
  if (pass.length === 0) throw new Error("no pass fixtures");
  if (fail.length === 0) throw new Error("no fail fixtures");
  return { pass, fail };
}
