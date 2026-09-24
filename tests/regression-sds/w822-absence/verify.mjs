#!/usr/bin/env node
/**
 * Verify one absence-not-demand fixture.
 * Default: expect reject → exit 0 when classifier rejects.
 * --expect accept: seeded absence-as-demand must exit 1 (SEED_REJECT).
 */
import { isAbsolute, relative, sep } from "node:path";
import { envelope } from "./lib/envelope.mjs";
import { loadFixture } from "./lib/catalog.mjs";
import { evaluateFixture } from "./lib/evaluate.mjs";
import { PRINCIPLE, REPO_ROOT } from "./lib/root.mjs";

function presentFixture(abs) {
  const rel = relative(REPO_ROOT, abs);
  const repoRelative = rel && rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel) ? rel : null;
  return { absolute: abs, repoRelative };
}

function usage() {
  return `usage: node verify.mjs [--json] [--fixture <path>] [--expect reject|accept]
         node verify.mjs --fixture fixtures/cases/x402scan-unavailable-as-demand.json --expect accept
         --pay/--payment/--checkout/--settle/--publish/--live and other unknown options exit 2.`;
}

const REFUSED_FLAG_NAMES = new Set([
  "live",
  "pay",
  "payment",
  "checkout",
  "settle",
  "publish",
  "registry",
  "refresh",
  "write",
  "rematerialize",
]);

function optionName(arg) {
  let name = arg.startsWith("--") ? arg.slice(2) : arg.slice(1);
  const eq = name.indexOf("=");
  if (eq !== -1) name = name.slice(0, eq);
  return name;
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
    else if (a === "--expect") out.expect = String(argv[++i] || "reject");
    else if (a === "--fixture") out.fixture = String(argv[++i] || "");
    else if (a.startsWith("-")) {
      if (REFUSED_FLAG_NAMES.has(optionName(a))) {
        const err = new Error(`${a} is refused: this verifier does not pay, settle, checkout, publish, write, or fetch`);
        err.code = "REFUSED";
        throw err;
      }
      const err = new Error(`unknown argument ${a}`);
      err.code = "USAGE";
      throw err;
    } else if (!out.fixture) out.fixture = a;
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
  if (args.help || !args.fixture) {
    console.error(usage());
    process.exitCode = args.help ? 0 : 2;
    return;
  }

  let loaded;
  try {
    loaded = loadFixture(args.fixture);
  } catch (error) {
    const code = error.code === "ENOENT" ? "MISSING_FIXTURE" : error.code || "BAD_FIXTURE";
    const body = envelope({
      command: "verify",
      status: "fail",
      ok: false,
      error: { code, message: error.message },
      result: null,
    });
    process.stdout.write(`${JSON.stringify(body)}\n`);
    process.exitCode = 2;
    return;
  }
  const { abs, raw } = loaded;
  const located = presentFixture(abs);
  const evaluated = evaluateFixture(raw, args.expect);
  const body = envelope({
    command: "verify",
    status: evaluated.status,
    ok: evaluated.ok,
    evidence: [
      {
        kind: "fixture",
        id: raw.id,
        path: located.absolute,
        repoRelative: located.repoRelative,
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
