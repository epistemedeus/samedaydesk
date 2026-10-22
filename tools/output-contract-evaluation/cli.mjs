#!/usr/bin/env node
import { parseArgs } from "node:util";
import {
  evaluateFile,
  evaluateSdsConsumerEvidence,
  loadCatalog,
  runSuite,
} from "./lib.mjs";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    consumer: { type: "boolean", default: false },
    suite: { type: "boolean", default: false },
    file: { type: "string" },
    "expect-reject": { type: "string" },
    pretty: { type: "boolean", default: false },
    help: { type: "boolean", default: false },
  },
});

if (values.help) {
  process.stdout.write(`Catalog-only output-contract evaluation over SDS consumer evidence.

Usage:
  node tools/output-contract-evaluation/cli.mjs
  node tools/output-contract-evaluation/cli.mjs --consumer
  node tools/output-contract-evaluation/cli.mjs --suite
  node tools/output-contract-evaluation/cli.mjs --file <file.json>
  node tools/output-contract-evaluation/cli.mjs --expect-reject <code> <file.json>

Does not fetch, pay, publish, or write a registry. Default is --consumer.
`);
  process.exit(0);
}

const indent = values.pretty ? 2 : 0;

function write(value, ok) {
  process.stdout.write(`${JSON.stringify(value, null, indent)}\n`);
  process.exit(ok ? 0 : 1);
}

const catalog = loadCatalog();
const selected = [values.consumer, values.suite, Boolean(values.file), Boolean(values["expect-reject"])].filter(Boolean).length;

if (selected > 1) {
  process.stderr.write("Choose one of --consumer, --suite, --file, or --expect-reject.\n");
  process.exit(2);
}

if (values.suite) {
  if (positionals.length > 0) {
    process.stderr.write("--suite does not take files.\n");
    process.exit(2);
  }
  const report = runSuite(catalog);
  write(
    {
      ok: report.ok,
      passed: report.passed,
      failed: report.failed,
      total: report.total,
      results: report.results.map((item) => ({
        file: item.filePath,
        expect: item.expect,
        expectedCode: item.expectedCode ?? null,
        ok: item.ok,
        codes: item.codes,
      })),
    },
    report.ok,
  );
}

if (values["expect-reject"]) {
  if (positionals.length !== 1) {
    process.stderr.write("--expect-reject requires exactly one file.\n");
    process.exit(2);
  }
  const result = evaluateFile(positionals[0], catalog);
  const codes = (result.errors || []).map((item) => item.code);
  const ok = result.ok === false && codes.includes(values["expect-reject"]);
  write(
    {
      ok,
      expectReject: values["expect-reject"],
      file: result.file,
      kind: result.kind || null,
      completeness: result.completeness || null,
      catalogEligible: result.catalogEligible === true,
      codes,
      errors: result.errors,
    },
    ok,
  );
}

if (values.file || positionals.length > 0) {
  const filePath = values.file || positionals[0];
  if (positionals.length > 1 || (values.file && positionals.length > 0)) {
    process.stderr.write("Pass exactly one file to --file.\n");
    process.exit(2);
  }
  const result = evaluateFile(filePath, catalog);
  write(
    {
      ok: result.ok === true,
      file: result.file,
      kind: result.kind || null,
      completeness: result.completeness || null,
      catalogEligible: result.catalogEligible === true,
      summary: result.summary || null,
      codes: (result.errors || []).map((item) => item.code),
      errors: result.errors,
      routes: result.routes || [],
    },
    result.ok === true,
  );
}

const report = evaluateSdsConsumerEvidence(catalog);
write(report, report.ok === true);
