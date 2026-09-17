#!/usr/bin/env node
/**
 * Black-box honesty check for a useful-job desk report.
 * Exit 0 only when delivered claims have every promised output file.
 * Seeded missing-output-reported-delivered exits 2 with parseable JSON.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { checkDeskReport, fail } from "../lib/check-report.mjs";
import { SEEDED_REPORT } from "../lib/paths.mjs";

function parseArgs(argv) {
  const args = { reportPath: null, outDir: null, seeded: false, pretty: true };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--report") args.reportPath = argv[++i];
    else if (a === "--out-dir") args.outDir = argv[++i];
    else if (a === "--seeded-fixture") {
      args.seeded = true;
      args.reportPath = SEEDED_REPORT;
    } else if (a === "--compact") args.pretty = false;
    else if (a === "--help" || a === "-h") args.help = true;
    else {
      return { error: fail("usage", `unknown argument: ${a}`) };
    }
  }
  if (!args.help && !args.reportPath) {
    return { error: fail("usage", "--report PATH or --seeded-fixture is required") };
  }
  if (args.reportPath) args.reportPath = resolve(process.cwd(), args.reportPath);
  if (args.outDir) args.outDir = resolve(process.cwd(), args.outDir);
  return { args };
}

function usage() {
  return `Usage:
  node tests/v6-useful-job-desk-counterexamples/bin/check-desk-report.mjs --seeded-fixture
  node tests/v6-useful-job-desk-counterexamples/bin/check-desk-report.mjs --report PATH [--out-dir DIR]

Black-box check: missing output cannot report delivered.
Exit 0: honest report (delivered only with every promised file, or parseable failure).
Exit 2: parseable rejection JSON (including the seeded missing-output-delivered case).
`;
}

function loadReport(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    return fail("missing_report", `cannot read desk report: ${err.message}`);
  }
}

const parsed = parseArgs(process.argv.slice(2));
if (parsed.error) {
  process.stdout.write(`${JSON.stringify(parsed.error, null, 2)}\n`);
  process.exit(2);
}
if (parsed.args.help) {
  process.stderr.write(usage());
  process.exit(0);
}

const loaded = loadReport(parsed.args.reportPath);
if (loaded.ok === false && loaded.code === "missing_report") {
  process.stdout.write(`${JSON.stringify(loaded, null, parsed.args.pretty ? 2 : 0)}\n`);
  process.exit(2);
}

const result = checkDeskReport(loaded, {
  reportPath: parsed.args.reportPath,
  outDir: parsed.args.outDir,
  seeded: parsed.args.seeded,
});
const indent = parsed.args.pretty ? 2 : 0;
process.stdout.write(`${JSON.stringify(result, null, indent)}\n`);
if (result.ok === true && result.honest === true) process.exit(0);
process.exit(2);
