#!/usr/bin/env node
/**
 * Verify one absence-not-demand fixture.
 * Default: expect reject → exit 0 when classifier rejects.
 * --expect accept: seeded absence-as-demand must exit 1 (SEED_REJECT).
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { classifyAbsenceAsDemand } from "./lib/classify.mjs";
import { envelope } from "./lib/envelope.mjs";
import { PRINCIPLE } from "./lib/pin.mjs";

const here = dirname(fileURLToPath(import.meta.url));

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
      out.expect = String(argv[++i] || "reject");
    } else if (a === "--fixture") {
      out.fixture = String(argv[++i] || "");
    } else if (!a.startsWith("-") && !out.fixture) {
      out.fixture = a;
    }
  }
  return out;
}

function loadFixture(pathArg) {
  const abs = resolve(here, pathArg);
  const raw = JSON.parse(readFileSync(abs, "utf8"));
  return { abs, raw };
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help || !args.fixture) {
    console.error(usage());
    process.exitCode = args.help ? 0 : 2;
    return;
  }

  const { abs, raw } = loadFixture(args.fixture);
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
  } else {
    if (verdict.reject) {
      ok = true;
      status = "pass";
      exit = 0;
    } else {
      ok = false;
      status = "fail";
      exit = 1;
      error = {
        code: "FALSE_ACCEPT",
        message: `fixture ${raw.id || "case"} was not rejected (would treat absence as demand)`,
        reasons: verdict.reasons,
      };
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

  if (args.json) {
    process.stdout.write(JSON.stringify(body) + "\n");
  } else {
    console.log(
      `${ok ? "PASS" : "FAIL"} ${raw.id} reject=${verdict.reject} absenceAsDemand=${verdict.absenceAsDemand} reasons=${JSON.stringify(verdict.reasons)}`,
    );
  }
  process.exitCode = exit;
}

main();
