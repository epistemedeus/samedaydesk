#!/usr/bin/env node
/**
 * Verify one unpaid-402 fixture against the shipped SDS parser.
 * Default --expect reject: pass when product rejects.
 * --expect accept on a reject fixture is the seeded-failure path (exit 1 SEED_REJECT).
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { classifyUnpaid402 } from "./lib/classify.mjs";
import { envelope } from "./lib/envelope.mjs";
import { BOUNDARY, PRODUCT } from "./lib/cite.mjs";

const here = dirname(fileURLToPath(import.meta.url));

function usage() {
  return `usage: node verify.mjs [--json] --fixture <path> [--expect reject|accept]
         node verify.mjs --fixture fixtures/cases/empty-accepts.json --expect accept --json`;
}

function parseArgs(argv) {
  const out = { json: true, fixture: null, expect: null, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--help" || a === "-h") out.help = true;
    else if (a === "--json") out.json = true;
    else if (a === "--no-json") out.json = false;
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
    } else if (!a.startsWith("-") && !out.fixture) {
      out.fixture = a;
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

function loadFixture(pathArg) {
  const abs = resolve(here, pathArg);
  return { abs, raw: JSON.parse(readFileSync(abs, "utf8")) };
}

function main(argv = process.argv.slice(2)) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (err) {
    const body = envelope({
      command: "usage",
      status: "usage",
      ok: false,
      error: { code: err.code || "usage", message: err.message },
    });
    process.stdout.write(`${JSON.stringify(body)}\n`);
    process.stderr.write(usage() + "\n");
    process.exitCode = 2;
    return;
  }

  if (args.help || !args.fixture) {
    process.stderr.write(usage() + "\n");
    process.exitCode = args.help ? 0 : 2;
    return;
  }

  const { abs, raw } = loadFixture(args.fixture);
  const expect = args.expect || raw.expected || "reject";
  const verdict = classifyUnpaid402(raw);
  const expectAccept = expect === "accept";
  const codeOk = !raw.expectCode || verdict.code === raw.expectCode;

  let ok;
  let status;
  let error = null;
  let exit;

  if (expectAccept) {
    if (verdict.verdict === "accept" && codeOk) {
      ok = true;
      status = "pass";
      exit = 0;
    } else {
      ok = false;
      status = "fail";
      exit = 1;
      error = {
        code: "SEED_REJECT",
        kind: "false_accept",
        message: `seeded accept refused: ${raw.id || "case"} claimed accept, product ${verdict.verdict}/${verdict.code}`,
        reasons: verdict.reasons,
      };
    }
  } else if (expect === "reject") {
    if (verdict.verdict === "reject" && codeOk) {
      ok = true;
      status = "pass";
      exit = 0;
    } else if (verdict.verdict === "accept") {
      ok = false;
      status = "fail";
      exit = 1;
      error = {
        code: "FALSE_ACCEPT",
        kind: "false_reject_missed",
        message: `fixture ${raw.id || "case"} was accepted as current unpaid-402`,
        reasons: verdict.reasons,
      };
    } else {
      ok = false;
      status = "fail";
      exit = 1;
      error = {
        code: "CODE_MISMATCH",
        message: `fixture ${raw.id || "case"} rejected as ${verdict.code}, expected ${raw.expectCode}`,
        reasons: verdict.reasons,
      };
    }
  } else {
    ok = false;
    status = "usage";
    exit = 2;
    error = { code: "unknown_expect", message: `--expect must be reject|accept, got ${expect}` };
  }

  const body = envelope({
    command: "verify",
    status,
    ok,
    evidence: [
      {
        kind: "fixture",
        id: raw.id,
        path: abs,
        class: raw.class,
        evaluate: raw.evaluate,
        seededFalseAccept: Boolean(raw.seededFalseAccept),
      },
      {
        kind: "classification",
        verdict: verdict.verdict,
        code: verdict.code,
        reasons: verdict.reasons,
        product: verdict.product,
      },
      { kind: "product-cite", ...PRODUCT },
    ],
    error,
    result: {
      id: raw.id,
      expect,
      claimedVerdict: expect,
      observedVerdict: verdict.verdict,
      observedCode: verdict.code,
      reject: verdict.reject,
      reasons: verdict.reasons,
      paymentSent: false,
    },
  });

  if (args.json) process.stdout.write(`${JSON.stringify(body)}\n`);
  else {
    process.stdout.write(
      `${ok ? "PASS" : "FAIL"} ${raw.id} expect=${expect} observed=${verdict.verdict}/${verdict.code} reasons=${JSON.stringify(verdict.reasons)}\n`,
    );
  }
  if (body.boundary.paymentSent !== false || BOUNDARY.paymentSent !== false) {
    process.exitCode = 64;
    return;
  }
  process.exitCode = exit;
}

const thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === thisFile) {
  main();
}

export { main };
