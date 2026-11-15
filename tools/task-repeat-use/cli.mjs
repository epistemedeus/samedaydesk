#!/usr/bin/env node
import { CASE_NAMES, runCase } from "./src/cases.mjs";
import { loadCoverage } from "./src/coverage.mjs";

const command = process.argv[2];
const flag = (name) => {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
};

function emit(value, exitCode) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
  process.exit(exitCode);
}

if (command === "coverage") {
  const coverage = loadCoverage();
  emit(coverage, coverage.ok ? 0 : 1);
}

if (command === "walk") {
  const name = flag("case");
  if (!CASE_NAMES.includes(name)) {
    emit({ ok: false, seam: "broken", code: "unknown_case", cases: CASE_NAMES }, 1);
  }
  const result = await runCase(name);
  emit(result, result.seam === "demonstrated" ? 0 : 1);
}

emit({
  ok: false,
  code: "usage",
  message: "usage: coverage | walk --case <name>",
  cases: CASE_NAMES,
}, 1);
