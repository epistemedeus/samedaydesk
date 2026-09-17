#!/usr/bin/env node
/**
 * Verify one stale-output fixture.
 * Default: expect reject → exit 0 when classifier rejects; exit 1 JSON fail if would accept.
 * --expect accept | --as-accept: treat as accept path (seeded greenwash must exit 1).
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { classifyStaleOutput } from "./lib/classify.mjs";
import { envelope } from "./lib/envelope.mjs";
import { CURRENT_PIN } from "./lib/pin.mjs";

const here = dirname(fileURLToPath(import.meta.url));

function usage() {
  return `usage: node verify.mjs [--json] [--fixture <path>] [--expect reject|accept] [--as-accept]
         node verify.mjs --fixture fixtures/cases/greenwash-stale-pin.json --expect accept`;
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
    expectedReasons: raw.expectedReasons,
  };
  const verdict = classifyStaleOutput(output, meta);

  const expectAccept = args.expect === "accept" || args.asAccept;
  // Corpus mode: we WANT reject. Seeded accept mode: feeding greenwash as accept must fail.
  let ok;
  let status;
  let error = null;
  let exit;

  if (expectAccept) {
    // Caller claims this output should be accepted — if classifier rejects, return fail JSON exit 1
    if (verdict.reject) {
      ok = false;
      status = "fail";
      exit = 1;
      error = {
        code: "SEED_REJECT",
        message: `seeded accept refused: ${raw.id || "case"} is stale/greenwash`,
        reasons: verdict.reasons,
      };
    } else {
      ok = true;
      status = "pass";
      exit = 0;
    }
  } else {
    // Default: expect reject. Pass when classifier rejects (and greenwash flagged when claimed success).
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
        message: `fixture ${raw.id || "case"} was not rejected (would greenwash)`,
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
        seededGreenwash: Boolean(raw.seededGreenwash),
      },
      {
        kind: "classification",
        reject: verdict.reject,
        greenwash: verdict.greenwash,
        reasons: verdict.reasons,
        detail: verdict.detail,
      },
      { kind: "pin", ...CURRENT_PIN },
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

  if (args.json) {
    process.stdout.write(JSON.stringify(body) + "\n");
  } else {
    console.log(
      `${ok ? "PASS" : "FAIL"} ${raw.id} reject=${verdict.reject} greenwash=${verdict.greenwash} reasons=${JSON.stringify(verdict.reasons)}`,
    );
  }
  process.exitCode = exit;
}

main();
