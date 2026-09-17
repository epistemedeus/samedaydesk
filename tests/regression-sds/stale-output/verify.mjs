#!/usr/bin/env node
/**
 * Verify one stale-output fixture.
 * Default --expect reject: exit 0 when classifier rejects.
 * --expect accept: feeding greenwash as accept must exit 1 with SEED_REJECT.
 */
import { classifyStaleOutput } from "./lib/classify.mjs";
import { envelope } from "./lib/envelope.mjs";
import { CURRENT_PIN } from "./lib/pin.mjs";
import { loadFixture } from "./lib/catalog.mjs";

const USAGE = `samedaydesk stale-output verify

Usage:
  node tests/regression-sds/stale-output/verify.mjs --fixture <path> [--expect reject|accept] [--json]
  node tests/regression-sds/stale-output/verify.mjs --fixture fixtures/cases/greenwash-stale-pin.json --expect accept --json

Write boundary: tests/regression-sds/stale-output/**. Does not pay Stripe/x402.
`;

function usageError(code, message) {
  const err = new Error(message);
  err.code = code;
  err.usage = true;
  return err;
}

function parseArgs(argv) {
  const out = { json: true, fixture: null, expect: "reject", asAccept: false, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--help" || a === "-h") out.help = true;
    else if (a === "--json") out.json = true;
    else if (a === "--no-json") out.json = false;
    else if (a === "--as-accept") {
      out.asAccept = true;
      out.expect = "accept";
    } else if (a === "--expect") {
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
  if (out.expect !== "reject" && out.expect !== "accept") {
    throw usageError("bad_expect", "--expect must be reject|accept");
  }
  return out;
}

function emit(body, json) {
  if (json) process.stdout.write(`${JSON.stringify(body)}\n`);
  else {
    const mark = body.ok ? "PASS" : "FAIL";
    const id = body.result?.id || "case";
    process.stdout.write(
      `${mark} ${id} reject=${body.result?.reject} greenwash=${body.result?.greenwash} reasons=${JSON.stringify(body.result?.reasons || [])}\n`,
    );
  }
  if (json && body.error) process.stderr.write(`${body.error.code}: ${body.error.message}\n`);
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
    emit(body, true);
    process.stderr.write(USAGE);
    process.exitCode = 2;
    return;
  }

  if (args.help) {
    process.stdout.write(USAGE);
    process.exitCode = 0;
    return;
  }
  if (!args.fixture) {
    const body = envelope({
      command: "usage",
      status: "usage",
      ok: false,
      error: { code: "missing_operand", message: "--fixture is required" },
    });
    emit(body, true);
    process.stderr.write(USAGE);
    process.exitCode = 2;
    return;
  }

  const { abs, raw } = loadFixture(args.fixture);
  const output = raw.output || raw;
  const verdict = classifyStaleOutput(output, { surface: raw.surface || output.surface });
  const expectAccept = args.expect === "accept" || args.asAccept;

  let ok;
  let status;
  let error = null;
  let exit;

  if (expectAccept) {
    if (verdict.reject) {
      ok = false;
      status = "fail";
      exit = 1;
      error = {
        code: "SEED_REJECT",
        message: `seeded accept refused: ${raw.id} is stale/greenwash`,
        reasons: verdict.reasons,
      };
    } else {
      ok = true;
      status = "pass";
      exit = 0;
    }
  } else if (verdict.reject) {
    ok = true;
    status = "pass";
    exit = 0;
  } else {
    ok = false;
    status = "fail";
    exit = 1;
    error = {
      code: "FALSE_ACCEPT",
      message: `fixture ${raw.id} was not rejected (would greenwash)`,
      reasons: verdict.reasons,
    };
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
        seededGreenwash: Boolean(raw.seededGreenwash),
      },
      {
        kind: "classification",
        reject: verdict.reject,
        greenwash: verdict.greenwash,
        reasons: verdict.reasons,
        detail: verdict.detail,
      },
      {
        kind: "pin",
        version: CURRENT_PIN.version,
        sha256: CURRENT_PIN.sha256,
        bytes: CURRENT_PIN.bytes,
        builtAt: CURRENT_PIN.builtAt,
        kitPath: CURRENT_PIN.kitPath,
      },
    ],
    error,
    result: {
      id: raw.id,
      expect: expectAccept ? "accept" : "reject",
      reject: verdict.reject,
      greenwash: verdict.greenwash,
      reasons: verdict.reasons,
      claimedSuccess: verdict.detail.claimedSuccess,
    },
  });

  emit(body, args.json);
  process.exitCode = exit;
}

main();
