import { evaluateFile, FAIL_DIR, fileMatchesExpectation, listJsonFiles, PASS_DIR } from "./case.mjs";
import { PACK_ID, REPORT_SCHEMA } from "./rules.mjs";

export function runDir(dir, { kind } = {}) {
  const files = listJsonFiles(dir);
  const results = files.map((filePath) => {
    const report = evaluateFile(filePath);
    const matches = fileMatchesExpectation(report);
    return { ...report, kind: kind ?? null, matchesExpectation: matches };
  });
  return results;
}

export function runSuite() {
  const pass = runDir(PASS_DIR, { kind: "pass" });
  const fail = runDir(FAIL_DIR, { kind: "fail" });
  const results = [...pass, ...fail];
  const unexpected = results.filter((item) => !item.matchesExpectation);
  return {
    schema: REPORT_SCHEMA,
    pack: PACK_ID,
    mode: "suite",
    ok: unexpected.length === 0,
    passed: pass.filter((item) => item.matchesExpectation).length,
    rejectedAsExpected: fail.filter((item) => item.matchesExpectation).length,
    unexpected: unexpected.length,
    total: results.length,
    results: results.map((item) => ({
      id: item.id,
      filePath: item.filePath,
      kind: item.kind,
      expect: item.expect ?? (item.kind === "fail" ? "reject" : "pass"),
      verdict: item.verdict,
      code: item.code,
      ok: item.ok,
      matchesExpectation: item.matchesExpectation,
      isError: item.classification?.isError ?? null,
      httpStatus: item.httpStatus ?? null,
    })),
  };
}

export function runSeededFailure() {
  const results = runDir(FAIL_DIR, { kind: "fail" });
  const unexpected = results.filter((item) => !item.matchesExpectation);
  return {
    schema: REPORT_SCHEMA,
    pack: PACK_ID,
    mode: "seeded-failure",
    ok: unexpected.length === 0 && results.length > 0,
    rejectedAsExpected: results.filter((item) => item.matchesExpectation).length,
    unexpected: unexpected.length,
    total: results.length,
    results: results.map((item) => ({
      id: item.id,
      filePath: item.filePath,
      verdict: item.verdict,
      code: item.code,
      ok: item.ok,
      matchesExpectation: item.matchesExpectation,
    })),
  };
}
