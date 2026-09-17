#!/usr/bin/env node
/**
 * Verify one stale-archive fixture.
 * Default: expect reject → exit 0 when classifier rejects.
 * --expect accept: seeded stale-as-current must exit 1 (SEED_REJECT).
 */
import { envelope } from "./lib/envelope.mjs";
import { loadFixture } from "./lib/catalog.mjs";
import { evaluateFixture } from "./lib/evaluate.mjs";
import { loadPins } from "./lib/pin.mjs";
import { PRINCIPLE, REFUSED_FLAGS } from "./lib/root.mjs";

function usage() {
  return `usage: node verify.mjs [--json] [--fixture <path>] [--expect reject|accept]
         node verify.mjs --fixture fixtures/cases/stale-110-as-current.json --expect accept`;
}

function parseArgs(argv) {
  const out = {
    json: true,
    fixture: null,
    expect: "reject",
    help: false,
    refused: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") out.help = true;
    else if (a === "--json") out.json = true;
    else if (a === "--no-json") out.json = false;
    else if (a === "--as-accept") out.expect = "accept";
    else if (a === "--expect") out.expect = String(argv[++i] || "reject");
    else if (a === "--fixture") out.fixture = String(argv[++i] || "");
    else if (REFUSED_FLAGS.includes(a) || a.startsWith("--pay") || a.startsWith("--stripe")) {
      out.refused = a;
    } else if (!a.startsWith("-") && !out.fixture) out.fixture = a;
  }
  return out;
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.refused) {
    const body = envelope({
      command: "verify",
      status: "fail",
      ok: false,
      error: {
        code: args.refused === "--live" ? "LIVE_REFUSE" : "PAY_REFUSE",
        message: `refused flag ${args.refused}`,
      },
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

  const pins = loadPins();
  const { abs, raw } = loadFixture(args.fixture);
  const evaluated = evaluateFixture(raw, args.expect, pins);
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
        seededStaleAsCurrent: Boolean(raw.seededStaleAsCurrent),
      },
      {
        kind: "classification",
        reject: evaluated.verdict.reject,
        staleAsCurrent: evaluated.verdict.staleAsCurrent,
        reasons: evaluated.verdict.reasons,
        detail: evaluated.verdict.detail,
      },
      evaluated.probe
        ? {
            kind: "obtain-archive",
            ok: evaluated.probe.ok,
            refused: evaluated.probe.refused,
            code: evaluated.probe.code,
            childExit: evaluated.probe.childExit,
            destExists: evaluated.probe.destExists,
          }
        : null,
      { kind: "principle", ...PRINCIPLE },
    ].filter(Boolean),
    error: evaluated.error,
    result: evaluated.result,
  });

  if (args.json) process.stdout.write(`${JSON.stringify(body)}\n`);
  else {
    console.log(
      `${evaluated.ok ? "PASS" : "FAIL"} ${raw.id} reject=${evaluated.verdict.reject} staleAsCurrent=${evaluated.verdict.staleAsCurrent} reasons=${JSON.stringify(evaluated.verdict.reasons)}`,
    );
  }
  process.exitCode = evaluated.exit;
}

main();
