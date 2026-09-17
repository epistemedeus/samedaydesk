#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadCatalog, loadSeed, isSeededKind, judge, judgeNaive } from "./lib/catalog.mjs";
import { evaluateCase } from "./lib/evaluate.mjs";
import { REPO_ROOT } from "./lib/root.mjs";

const USAGE = `samedaydesk regression corpus

Usage:
  node tests/regression/corpus/run.mjs [--json] [--surface merchant|buyer|verifier|pack]
  node tests/regression/corpus/run.mjs --seeded-failure [--json]
  node tests/regression/corpus/run.mjs --seeded-false-reject [--json]
  node tests/regression/corpus/run.mjs --fixture <path> [--json]
  node tests/regression/corpus/run.mjs --list

Write boundary: tests/regression/corpus/**. Does not edit tools/verify or verify-samedaydesk.
Does not pay Stripe/x402. Does not POST MCP tools/call.
`;

function parseArgs(argv) {
  const out = { json: false, list: false, seededFailure: false, seededFalseReject: false, fixture: null, surface: null };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--json") out.json = true;
    else if (a === "--list") out.list = true;
    else if (a === "--seeded-failure") out.seededFailure = true;
    else if (a === "--seeded-false-reject") out.seededFalseReject = true;
    else if (a === "--fixture") {
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) throw usageError("missing_operand", "--fixture requires a path");
      out.fixture = next;
      i += 1;
    } else if (a === "--surface") {
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) throw usageError("missing_operand", "--surface requires merchant|buyer|verifier|pack");
      out.surface = next;
      i += 1;
    } else if (a === "--help" || a === "-h") out.help = true;
    else throw usageError("unknown_flag", `unknown argument ${a}`);
  }
  return out;
}

function usageError(code, message) {
  const err = new Error(message);
  err.code = code;
  err.usage = true;
  return err;
}

function envelope({ ok, command, status, cases, error, result }) {
  return {
    ok,
    schema: "samedaydesk.regression-corpus.report.v1",
    schemaVersion: 1,
    command,
    repo: "samedaydesk",
    checkedAt: new Date().toISOString(),
    node: { wanted: "22.x", actual: process.version },
    status,
    writeBoundary: "tests/regression/corpus/**",
    counts: summarize(cases || []),
    cases: cases || [],
    error,
    result: result ?? null,
    boundary: { paymentSent: false, toolsCalled: false },
  };
}

function summarize(cases) {
  const counts = { total: cases.length, pass: 0, fail: 0, caught: 0, missed: 0 };
  for (const row of cases) {
    if (row.status === "pass") counts.pass += 1;
    else if (row.status === "caught") counts.caught += 1;
    else if (row.status === "missed") counts.missed += 1;
    else counts.fail += 1;
  }
  return counts;
}

async function runEntry(entry, { naive = false } = {}) {
  const observed = await evaluateCase(entry);
  const judged = naive ? judgeNaive(entry, observed) : judge(entry, observed);
  return {
    id: entry.id,
    surface: entry.surface,
    kind: entry.kind,
    title: entry.title,
    expected: entry.expected,
    expectCode: entry.expectCode || null,
    claimedVerdict: judged.claimedVerdict,
    observedVerdict: judged.observedVerdict,
    observedCode: observed.code,
    status: judged.status,
    ok: judged.ok,
    seeded: judged.seeded,
    message: observed.message,
    origin: entry.origin,
  };
}

function printHuman(report) {
  const lines = [`samedaydesk regression corpus  ${report.status}  ${report.command}`];
  for (const row of report.cases) {
    const mark = row.status === "pass" || row.status === "caught" ? "ok" : "not ok";
    lines.push(`  ${mark}  ${row.status.padEnd(6)}  ${row.id}  (${row.observedVerdict}/${row.observedCode})`);
  }
  const c = report.counts;
  lines.push(`${c.pass} pass, ${c.caught} seeded caught, ${c.fail + c.missed} fail, ${c.total} total`);
  if (report.error) lines.push(`${report.error.code}: ${report.error.message}`);
  return `${lines.join("\n")}\n`;
}

function emit(report, json, stream = process.stdout, errStream = process.stderr) {
  if (json) stream.write(`${JSON.stringify(report, null, 2)}\n`);
  else stream.write(printHuman(report));
  if (json && report.error) errStream.write(`${report.error.code}: ${report.error.message}\n`);
}

function catalogEntryFromSeed(seed, catalog) {
  const fromCatalog = catalog.cases.find((entry) => entry.id === seed.id);
  if (fromCatalog) {
    return {
      ...fromCatalog,
      claimedVerdict: seed.claimedVerdict ?? fromCatalog.claimedVerdict,
      evaluate: seed.evaluate ?? fromCatalog.evaluate,
    };
  }
  return {
    id: seed.id,
    surface: seed.surface,
    evaluate: seed.evaluate,
    kind: seed.kind === "false_accept" ? "seeded_false_accept" : seed.kind === "false_reject" ? "seeded_false_reject" : seed.kind,
    claimedVerdict: seed.claimedVerdict,
    expected: seed.productMust,
    expectCode: seed.expectCode,
    title: seed.title,
    origin: seed.origin || seed.id,
  };
}

async function main(argv = process.argv.slice(2)) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (err) {
    const report = envelope({
      ok: false,
      command: "usage",
      status: "usage",
      cases: [],
      error: { code: err.code || "usage", message: err.message },
    });
    emit(report, true, process.stdout, process.stderr);
    process.stderr.write(USAGE);
    return 2;
  }

  if (args.help) {
    process.stdout.write(USAGE);
    return 0;
  }

  const catalog = loadCatalog();

  if (args.list) {
    for (const entry of catalog.cases) {
      process.stdout.write(`${entry.id}\t${entry.surface}\t${entry.kind}\t${entry.expected}\n`);
    }
    return 0;
  }

  if (args.seededFailure || args.seededFalseReject || args.fixture) {
    const command = args.fixture ? "fixture" : args.seededFalseReject ? "seeded-false-reject" : "seeded-failure";
    let seed;
    if (args.fixture) {
      seed = JSON.parse(readFileSync(resolve(REPO_ROOT, args.fixture), "utf8"));
    } else if (args.seededFalseReject) {
      seed = loadSeed("false-reject.json");
    } else {
      seed = loadSeed("false-accept.json");
    }
    const entry = catalogEntryFromSeed(seed, catalog);
    const row = await runEntry(entry, { naive: true });
    const caught = row.ok === false && (row.seeded === "false_accept" || row.seeded === "false_reject");
    const report = envelope({
      ok: false,
      command,
      status: "fail",
      cases: [row],
      error: {
        code: "SEED_REJECT",
        message: caught
          ? `seeded ${row.seeded} caught: ${entry.id} claimed ${row.claimedVerdict}, product ${row.observedVerdict}`
          : `seeded fixture ${entry.id} did not diverge from claimed verdict ${row.claimedVerdict}`,
        kind: row.seeded,
        id: entry.id,
      },
      result: { seed, naive: true },
    });
    emit(report, args.json);
    return 1;
  }

  const selected = catalog.cases.filter((entry) => (args.surface ? entry.surface === args.surface : true));
  const cases = [];
  for (const entry of selected) {
    cases.push(await runEntry(entry));
  }
  const failed = cases.filter((row) => row.ok !== true);
  const seededCaught = cases.filter((row) => row.status === "caught").length;
  const report = envelope({
    ok: failed.length === 0 && (args.surface ? true : seededCaught >= 1),
    command: "run",
    status: failed.length === 0 && (args.surface ? true : seededCaught >= 1) ? "pass" : "fail",
    cases,
    error:
      failed.length === 0
        ? null
        : {
            code: "CORPUS_FAIL",
            message: `${failed.length} case(s) failed: ${failed.map((row) => row.id).join(", ")}`,
          },
    result: { seededCaught, productCases: cases.filter((row) => !isSeededKind(row.kind)).length },
  });
  emit(report, args.json);
  return report.ok ? 0 : 1;
}

const thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === thisFile) {
  main().then(
    (code) => process.exit(code),
    (err) => {
      process.stderr.write(`${err.code || "error"}: ${err.message}\n`);
      process.exit(64);
    },
  );
}

export { main };
