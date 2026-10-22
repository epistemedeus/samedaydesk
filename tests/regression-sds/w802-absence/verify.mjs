#!/usr/bin/env node
/**
 * Verify one absence-not-demand fixture.
 * Default: expect reject → exit 0 when classifier rejects.
 * --expect accept: seeded absence-as-demand must exit 1 (SEED_REJECT).
 */
import { envelope } from "./lib/envelope.mjs";
import { loadFixture } from "./lib/catalog.mjs";
import { evaluateFixture } from "./lib/evaluate.mjs";
import { PRINCIPLE } from "./lib/root.mjs";

function usage() {
  return `usage: node verify.mjs [--json] [--fixture <path>] [--expect reject|accept]
         node verify.mjs --fixture fixtures/cases/x402scan-unavailable-as-demand.json --expect accept`;
}

function parseArgs(argv) {
  const out = {
    json: true,
    fixture: null,
    expect: "reject",
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") out.help = true;
    else if (a === "--json") out.json = true;
    else if (a === "--no-json") out.json = false;
    else if (a === "--as-accept") out.expect = "accept";
    else if (a === "--live") {
      const err = new Error("--live is refused: this corpus never pays or fetches");
      err.code = "LIVE_FORBIDDEN";
      throw err;
    } else if (a === "--pay" || a.startsWith("--pay=") || a === "--stripe") {
      const err = new Error("--pay is refused: this corpus never pays or fetches");
      err.code = "PAY_FORBIDDEN";
      throw err;
    } else if (a === "--expect") {
      const v = argv[++i];
      if (v == null || String(v).startsWith("-")) {
        const err = new Error("missing --expect value");
        err.code = "USAGE";
        throw err;
      }
      if (v !== "reject" && v !== "accept") {
        const err = new Error(`expect must be reject|accept, got ${v}`);
        err.code = "USAGE";
        throw err;
      }
      out.expect = v;
    } else if (a === "--fixture") {
      const v = argv[++i];
      if (v == null || String(v).startsWith("-")) {
        const err = new Error("missing --fixture value");
        err.code = "USAGE";
        throw err;
      }
      out.fixture = v;
    } else if (a.startsWith("-")) {
      const err = new Error(`unknown argument ${a}`);
      err.code = "unknown_flag";
      throw err;
    } else if (!out.fixture) out.fixture = a;
    else {
      const err = new Error(`unknown argument ${a}`);
      err.code = "unknown_flag";
      throw err;
    }
  }
  return out;
}

function main(argv = process.argv.slice(2)) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (error) {
    const body = envelope({
      command: "verify",
      status: "fail",
      ok: false,
      error: { code: error.code || "BAD_ARGS", message: error.message },
      result: null,
    });
    process.stdout.write(`${JSON.stringify(body)}\n`);
    process.exitCode = 2;
    return;
  }
  if (args.help) {
    console.error(usage());
    process.exitCode = 0;
    return;
  }
  if (!args.fixture) {
    const body = envelope({
      command: "verify",
      status: "fail",
      ok: false,
      error: { code: "USAGE", message: usage() },
      result: null,
    });
    process.stdout.write(`${JSON.stringify(body)}\n`);
    process.exitCode = 2;
    return;
  }

  let loaded;
  try {
    loaded = loadFixture(args.fixture);
  } catch (error) {
    const body = envelope({
      command: "verify",
      status: "fail",
      ok: false,
      error: { code: error.code || "FIXTURE_INVALID", message: error.message },
      result: null,
    });
    process.stdout.write(`${JSON.stringify(body)}\n`);
    process.exitCode = 2;
    return;
  }

  const { abs, raw } = loaded;
  const evaluated = evaluateFixture(raw, args.expect);
  const body = envelope({
    command: "verify",
    status: evaluated.status,
    ok: evaluated.ok,
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
        reject: evaluated.verdict.reject,
        absenceAsDemand: evaluated.verdict.absenceAsDemand,
        reasons: evaluated.verdict.reasons,
        detail: evaluated.verdict.detail,
      },
      { kind: "principle", ...PRINCIPLE },
    ],
    error: evaluated.error,
    result: evaluated.result,
  });

  if (args.json) process.stdout.write(`${JSON.stringify(body)}\n`);
  else {
    console.log(
      `${evaluated.ok ? "PASS" : "FAIL"} ${raw.id} reject=${evaluated.verdict.reject} absenceAsDemand=${evaluated.verdict.absenceAsDemand} reasons=${JSON.stringify(evaluated.verdict.reasons)}`,
    );
  }
  process.exitCode = evaluated.exit;
}

main();
