#!/usr/bin/env node
import { parseArgs } from "node:util";
import { evaluateFile, resolveCasePath } from "../src/case.mjs";
import { FORBIDDEN_FLAGS, PACK_ID } from "../src/rules.mjs";
import { runSeededFailure, runSuite } from "../src/suite.mjs";

function printHelp() {
  process.stdout.write(`SameDayDesk MCP isError≠settle verifier.

Offline only. Never treats MCP isError true, JSON-RPC error, or HTTP 200 as settlement.

Usage:
  node bin/verify.mjs
  node bin/verify.mjs --suite
  node bin/verify.mjs --case <file.json>
  node bin/verify.mjs --seeded-failure
  node bin/verify.mjs --expect-reject <file.json>

Exit codes:
  0  suite matched, or a single case passed the invariant
  1  settle claim on isError/error, malformed case, or suite mismatch
  2  usage / forbidden flag

Forbidden: ${FORBIDDEN_FLAGS.join(" ")}
`);
}

function writeJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function refuseForbidden(argv) {
  const hit = argv.find((arg) => FORBIDDEN_FLAGS.includes(arg));
  if (!hit) return;
  writeJson({
    pack: PACK_ID,
    ok: false,
    verdict: "reject",
    code: "forbidden_flag",
    error: `refused ${hit}; this verifier is offline and does not pay, publish, or hit live rails`,
  });
  process.exit(2);
}

refuseForbidden(process.argv.slice(2));

let values;
let positionals;
try {
  ({ values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      suite: { type: "boolean", default: false },
      case: { type: "string" },
      "seeded-failure": { type: "boolean", default: false },
      "expect-reject": { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
  }));
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exit(2);
}

if (values.help) {
  printHelp();
  process.exit(0);
}

const modes = [values.suite, Boolean(values.case), values["seeded-failure"], values["expect-reject"]].filter(Boolean);
if (modes.length > 1) {
  process.stderr.write("Choose one of --suite, --case, --seeded-failure, --expect-reject.\n");
  process.exit(2);
}

if (values.suite || (modes.length === 0 && positionals.length === 0)) {
  const report = runSuite();
  writeJson(report);
  process.exit(report.ok ? 0 : 1);
}

if (values["seeded-failure"]) {
  const report = runSeededFailure();
  writeJson(report);
  process.exit(report.ok ? 0 : 1);
}

const fileArg = values.case || positionals[0];
if (!fileArg) {
  process.stderr.write("Pass --suite, --seeded-failure, --case <file>, or --help.\n");
  process.exit(2);
}

const filePath = resolveCasePath(fileArg);
const report = evaluateFile(filePath);

if (values["expect-reject"]) {
  const ok = report.verdict === "reject" && report.ok === false;
  writeJson({ ...report, expectReject: true, ok });
  process.exit(ok ? 0 : 1);
}

writeJson(report);
process.exit(report.verdict === "reject" || report.ok === false ? 1 : 0);
