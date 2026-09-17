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
         node verify.mjs --fixture fixtures/cases/mcp-surface-get-as-demand.json --expect accept`;
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
    else if (!a.startsWith("-") && !out.fixture) out.fixture = a;
  }
  return out;
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help || !args.fixture) {
    console.error(usage());
    process.exitCode = args.help ? 0 : 2;
    return;
  }

  const { abs, raw } = loadFixture(args.fixture);
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
