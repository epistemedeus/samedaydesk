#!/usr/bin/env node
/**
 * Verify one absence-not-demand fixture.
 * Default: expect reject → exit 0 when classifier rejects.
 * --expect accept: seeded absence-as-demand must exit 1 (SEED_REJECT).
 */
import { classifyAbsenceAsDemand } from "./lib/classify.mjs";
import { envelope } from "./lib/envelope.mjs";
import { loadFixture } from "./lib/fixture.mjs";
import { PRINCIPLE } from "./lib/pin.mjs";

function usage() {
  return `usage: node verify.mjs [--json] [--fixture <path>] [--expect reject|accept] [--as-accept]
         node verify.mjs --fixture fixtures/cases/route-absent-as-demand.json --expect accept`;
}

function parseArgs(argv) {
  const out = {
    json: true,
    fixture: null,
    expect: "reject",
    asAccept: false,
    help: false,
    usageError: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") out.help = true;
    else if (a === "--json") out.json = true;
    else if (a === "--no-json") out.json = false;
    else if (a === "--as-accept") {
      out.asAccept = true;
      out.expect = "accept";
    } else if (a === "--expect") {
      const v = argv[i + 1];
      if (v == null || v.startsWith("-")) {
        out.usageError = { code: "USAGE", message: "missing --expect value" };
      } else {
        i += 1;
        if (v !== "reject" && v !== "accept") {
          out.usageError = { code: "USAGE", message: `unknown --expect ${v}` };
        } else out.expect = v;
      }
    } else if (a === "--fixture") {
      const v = argv[i + 1];
      if (v == null || v.startsWith("-")) {
        out.usageError = { code: "USAGE", message: "missing --fixture value" };
      } else {
        i += 1;
        out.fixture = v;
      }
    } else if (a.startsWith("-")) {
      out.usageError = {
        code: a === "--live" ? "LIVE_FORBIDDEN" : "UNKNOWN_ARGUMENT",
        message: `unknown argument ${a}`,
      };
    } else if (!out.fixture) {
      out.fixture = a;
    } else {
      out.usageError = { code: "UNKNOWN_ARGUMENT", message: `unknown argument ${a}` };
    }
  }
  return out;
}

function writeEnvelope(body, json, textLine) {
  if (json) process.stdout.write(JSON.stringify(body) + "\n");
  else console.log(textLine);
}

function fail(args, code, message, extra = {}) {
  const body = envelope({
    command: "verify",
    status: "fail",
    ok: false,
    error: { code, message },
    result: extra.result ?? null,
  });
  writeEnvelope(body, args.json !== false, `FAIL ${code} ${message}`);
  process.exitCode = extra.exit ?? 2;
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    console.error(usage());
    process.exitCode = 0;
    return;
  }
  if (args.usageError) {
    fail(args, args.usageError.code, args.usageError.message);
    return;
  }
  if (!args.fixture) {
    fail(args, "USAGE", usage());
    return;
  }

  let loaded;
  try {
    loaded = loadFixture(args.fixture);
  } catch (e) {
    fail(args, e.code || "FIXTURE_INVALID", e.message, {
      exit: e.code === "USAGE" ? 2 : 2,
    });
    return;
  }

  const { abs, raw } = loaded;
  const output = raw.output || raw;
  const meta = {
    surface: raw.surface || output.surface,
    absence: raw.absence,
    paidActivity: raw.paidActivity,
    evidence: raw.evidence,
  };
  const verdict = classifyAbsenceAsDemand(output, meta);

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
        message: `seeded accept refused: ${raw.id || "case"} treats absence as demand`,
        reasons: verdict.reasons,
      };
    } else {
      ok = true;
      status = "pass";
      exit = 0;
    }
  } else if (!verdict.reject) {
    ok = false;
    status = "fail";
    exit = 1;
    error = {
      code: "FALSE_ACCEPT",
      message: `fixture ${raw.id || "case"} expected reject, classifier did not flag absence-as-demand`,
      reasons: verdict.reasons,
    };
  } else {
    const expected = Array.isArray(raw.expectedReasons) ? raw.expectedReasons : [];
    const missing = expected.filter((r) => !verdict.reasons.includes(r));
    if (missing.length) {
      ok = false;
      status = "fail";
      exit = 1;
      error = {
        code: "REASON_MISMATCH",
        message: `fixture ${raw.id || "case"} missing reasons ${missing.join(",")}`,
        missing,
        reasons: verdict.reasons,
      };
    } else {
      ok = true;
      status = "pass";
      exit = 0;
    }
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
        seededAbsenceAsDemand: Boolean(raw.seededAbsenceAsDemand),
      },
      {
        kind: "classification",
        reject: verdict.reject,
        absenceAsDemand: verdict.absenceAsDemand,
        reasons: verdict.reasons,
        detail: verdict.detail,
      },
      { kind: "principle", ...PRINCIPLE },
    ],
    error,
    result: {
      id: raw.id,
      expect: expectAccept ? "accept" : "reject",
      reject: verdict.reject,
      absenceAsDemand: verdict.absenceAsDemand,
      reasons: verdict.reasons,
      claimedSuccess: verdict.detail.claimedSuccess,
      claimedDemand: verdict.detail.claimedDemand,
    },
  });

  writeEnvelope(
    body,
    args.json,
    `${ok ? "PASS" : "FAIL"} ${raw.id} reject=${verdict.reject} absenceAsDemand=${verdict.absenceAsDemand} reasons=${JSON.stringify(verdict.reasons)}`,
  );
  process.exitCode = exit;
}

main();
