#!/usr/bin/env node
/**
 * Cold unpaid-402 regression corpus.
 * Exit 0 when every fixture matches its expected verdict.
 * --seeded-failure: feed empty-accepts as accept → exit 1 SEED_REJECT.
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { envelope } from "./lib/envelope.mjs";
import { FEATURE, WRITE_BOUNDARY } from "./lib/cite.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(join(here, "MANIFEST.json"), "utf8"));
const verifyBin = join(here, "verify.mjs");

const USAGE = `samedaydesk unpaid-402 regression

Usage:
  node tests/regression-sds/unpaid-402/run.mjs [--json]
  node tests/regression-sds/unpaid-402/run.mjs --seeded-failure [--json]
  node tests/regression-sds/unpaid-402/run.mjs --seeded-false-reject [--json]
  node tests/regression-sds/unpaid-402/run.mjs --fixture <path> [--expect reject|accept] [--json]
  node tests/regression-sds/unpaid-402/run.mjs --list

Write boundary: ${WRITE_BOUNDARY}. Does not pay, publish, or live-probe.
`;

function parseArgs(argv) {
  const out = {
    json: true,
    list: false,
    seededFailure: false,
    seededFalseReject: false,
    fixture: null,
    expect: null,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--json") out.json = true;
    else if (a === "--no-json") out.json = false;
    else if (a === "--list") out.list = true;
    else if (a === "--seeded-failure" || a === "--seeded-false-accept") out.seededFailure = true;
    else if (a === "--seeded-false-reject") out.seededFalseReject = true;
    else if (a === "--help" || a === "-h") out.help = true;
    else if (a === "--expect") {
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) throw usageError("missing_operand", "--expect requires reject|accept");
      out.expect = next;
      i += 1;
    } else if (a === "--fixture") {
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) throw usageError("missing_operand", "--fixture requires a path");
      out.fixture = next;
      i += 1;
    } else {
      throw usageError("unknown_flag", `unknown argument ${a}`);
    }
  }
  return out;
}

function usageError(code, message) {
  const err = new Error(message);
  err.code = code;
  err.usage = true;
  return err;
}

function runVerify(fixtureRel, expect) {
  const args = [verifyBin, "--json", "--fixture", fixtureRel, "--expect", expect];
  const r = spawnSync(process.execPath, args, { encoding: "utf8", cwd: here });
  let body;
  try {
    body = JSON.parse(String(r.stdout || "").trim() || "{}");
  } catch {
    body = { ok: false, parseError: true, stdout: r.stdout, stderr: r.stderr };
  }
  return { status: r.status ?? 1, body, stderr: r.stderr };
}

function printHuman(report) {
  const lines = [`samedaydesk ${FEATURE}  ${report.status}  ${report.command}`];
  for (const row of report.cases || report.result?.rows || []) {
    const mark = row.pass || row.status === "pass" || row.status === "caught" ? "ok" : "not ok";
    lines.push(
      `  ${mark}  ${String(row.status || (row.pass ? "pass" : "fail")).padEnd(6)}  ${row.id}  (${row.observedVerdict || row.expect}/${row.observedCode || ""})`,
    );
  }
  if (report.error) lines.push(`${report.error.code}: ${report.error.message}`);
  return `${lines.join("\n")}\n`;
}

function emit(report, json) {
  if (json) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  else process.stdout.write(printHuman(report));
  if (json && report.error) process.stderr.write(`${report.error.code}: ${report.error.message}\n`);
}

function main(argv = process.argv.slice(2)) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (err) {
    const report = envelope({
      command: "usage",
      status: "usage",
      ok: false,
      error: { code: err.code || "usage", message: err.message },
    });
    emit(report, true);
    process.stderr.write(USAGE);
    process.exitCode = 2;
    return;
  }

  if (args.help) {
    process.stdout.write(USAGE);
    process.exitCode = 0;
    return;
  }

  if (args.list) {
    for (const c of manifest.cases) {
      process.stdout.write(`${c.id}\t${c.expect}\t${c.expectCode || ""}\t${c.class}\n`);
    }
    process.exitCode = 0;
    return;
  }

  if (args.fixture) {
    const expect = args.expect || "reject";
    const { status, body } = runVerify(args.fixture, expect);
    process.stdout.write(`${JSON.stringify(body, null, 2)}\n`);
    process.exitCode = status === 0 ? 0 : status;
    return;
  }

  if (args.seededFailure || args.seededFalseReject) {
    const seedId = args.seededFalseReject ? manifest.seededFalseReject : manifest.seededFalseAccept;
    const seed = manifest.cases.find((c) => c.id === seedId);
    const command = args.seededFalseReject ? "seeded-false-reject" : "seeded-failure";
    if (!seed) {
      const report = envelope({
        command,
        status: "fail",
        ok: false,
        error: { code: "MISSING_SEED", message: `no ${seedId} case in MANIFEST` },
      });
      emit(report, args.json);
      process.exitCode = 1;
      return;
    }
    const claimed = args.seededFalseReject ? "reject" : "accept";
    const { status, body } = runVerify(seed.file, claimed);
    const report = envelope({
      command,
      status: "fail",
      ok: false,
      evidence: [
        { kind: "seed", id: seed.id, file: seed.file, claimed },
        { kind: "child", status, body },
      ],
      error: {
        code: "SEED_REJECT",
        kind: args.seededFalseReject ? "false_reject" : "false_accept",
        message:
          body.error?.message ||
          `seeded ${args.seededFalseReject ? "false_reject" : "false_accept"} caught: ${seed.id} claimed ${claimed}, product ${body.result?.observedVerdict}`,
        reasons: body.result?.reasons || body.error?.reasons || [],
        id: seed.id,
      },
      result: {
        id: seed.id,
        childExit: status,
        childOk: body.ok,
        claimedVerdict: claimed,
        observedVerdict: body.result?.observedVerdict,
        observedCode: body.result?.observedCode,
        reasons: body.result?.reasons || [],
      },
    });
    emit(report, args.json);
    process.exitCode = 1;
    return;
  }

  const rows = [];
  let failed = 0;
  for (const c of manifest.cases) {
    const { status, body } = runVerify(c.file, c.expect);
    const pass = status === 0 && body.ok === true && body.result?.observedVerdict === c.expect;
    const row = {
      id: c.id,
      class: c.class,
      expect: c.expect,
      expectCode: c.expectCode || null,
      status: pass ? "pass" : "fail",
      pass,
      observedVerdict: body.result?.observedVerdict,
      observedCode: body.result?.observedCode,
      reasons: body.result?.reasons || [],
      childExit: status,
      seededFalseAccept: Boolean(c.seededFalseAccept),
      seededFalseReject: Boolean(c.seededFalseReject),
    };
    rows.push(row);
    if (!pass) failed += 1;
  }

  const ok = failed === 0;
  const report = envelope({
    command: "run",
    status: ok ? "pass" : "fail",
    ok,
    evidence: [{ kind: "corpus", total: rows.length, failed }],
    error: ok
      ? null
      : { code: "CORPUS_FAIL", message: `${failed} case(s) failed: ${rows.filter((r) => !r.pass).map((r) => r.id).join(", ")}` },
    result: {
      passed: rows.length - failed,
      failed,
      total: rows.length,
      seededFalseAccept: manifest.seededFalseAccept,
      seededFalseReject: manifest.seededFalseReject,
      rows,
    },
    cases: rows,
  });
  emit(report, args.json);
  process.exitCode = ok ? 0 : 1;
}

const thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === thisFile) {
  main();
}

export { main };
