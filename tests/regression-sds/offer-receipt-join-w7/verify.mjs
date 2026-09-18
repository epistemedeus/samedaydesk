#!/usr/bin/env node
/**
 * Verify one offer-receipt join fixture.
 * Default expect accept (cold join) → exit 0 when exact keys join.
 * --expect reject: mismatch fixtures must reject.
 * --expect accept on a mismatch → exit 1 SEED_REJECT.
 */
import { readFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { envelope } from "./lib/envelope.mjs";
import { confineFixture } from "./lib/confine.mjs";
import { joinOfferReceipt } from "./lib/join.mjs";
import { PRINCIPLE, SEEDED_MISMATCH_ID } from "./lib/pin.mjs";
import { refusedArgv } from "./lib/refuse.mjs";

const here = dirname(fileURLToPath(import.meta.url));

function usage() {
  return `usage: node verify.mjs [--json] [--fixture <path>] [--expect accept|reject]
         node verify.mjs --fixture fixtures/cases/amount-mismatch.json --expect accept`;
}

function parseArgs(argv) {
  const out = {
    json: true,
    fixture: null,
    expect: null,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") out.help = true;
    else if (a === "--json") out.json = true;
    else if (a === "--no-json") out.json = false;
    else if (a === "--expect") out.expect = String(argv[++i] || "");
    else if (a === "--fixture") out.fixture = String(argv[++i] || "");
    else if (!a.startsWith("-") && !out.fixture) out.fixture = a;
  }
  return out;
}

function main(argv = process.argv.slice(2)) {
  const refused = refusedArgv(argv);
  if (refused.length) {
    const body = envelope({
      command: "verify",
      status: "fail",
      ok: false,
      error: {
        code: "money_movement_refused",
        message: `refused flags: ${refused.join(" ")}`,
        flags: refused,
      },
      result: null,
    });
    process.stdout.write(JSON.stringify(body) + "\n");
    process.exitCode = 2;
    return;
  }

  const args = parseArgs(argv);
  if (args.help || !args.fixture) {
    console.error(usage());
    process.exitCode = args.help ? 0 : 2;
    return;
  }

  const confined = confineFixture(args.fixture, here);
  if (!confined.ok) {
    const body = envelope({
      command: "verify",
      status: "fail",
      ok: false,
      error: { code: confined.code, message: confined.message, path: confined.abs },
      result: null,
    });
    process.stdout.write(JSON.stringify(body) + "\n");
    process.exitCode = 2;
    return;
  }
  const abs = confined.abs;
  let raw;
  try {
    raw = JSON.parse(readFileSync(abs, "utf8"));
  } catch (err) {
    const body = envelope({
      command: "verify",
      status: "fail",
      ok: false,
      error: {
        code: "FIXTURE_INVALID",
        message: `fixture is not JSON: ${err?.message || err}`,
        path: abs,
      },
      result: null,
    });
    process.stdout.write(JSON.stringify(body) + "\n");
    process.exitCode = 2;
    return;
  }
  const verdict = joinOfferReceipt(raw);
  const expect = args.expect || raw.expect || (raw.seededMismatch ? "reject" : "accept");
  const expectAccept = expect === "accept";

  let ok;
  let status;
  let error = null;
  let exit;

  if (expectAccept) {
    if (!verdict.joined) {
      ok = false;
      status = "fail";
      exit = 1;
      error = {
        code: raw.seededMismatch || raw.id === SEEDED_MISMATCH_ID ? "SEED_REJECT" : "JOIN_REJECT",
        message: `seeded/expected accept refused: ${raw.id || "case"} did not join`,
        reasons: verdict.reasons,
      };
    } else {
      ok = true;
      status = "pass";
      exit = 0;
    }
  } else if (verdict.joined) {
    ok = false;
    status = "fail";
    exit = 1;
    error = {
      code: "FALSE_ACCEPT",
      message: `fixture ${raw.id || "case"} joined but was expected to reject`,
      reasons: verdict.reasons,
    };
  } else {
    ok = true;
    status = "pass";
    exit = 0;
  }

  const body = envelope({
    command: "verify",
    status,
    ok,
    evidence: [
      { kind: "fixture", id: raw.id, path: abs, class: raw.class, seededMismatch: Boolean(raw.seededMismatch) },
      {
        kind: "join",
        joined: verdict.joined,
        mismatch: verdict.mismatch,
        reasons: verdict.reasons,
        exact: verdict.exact,
        offer: verdict.offer,
      },
      { kind: "principle", ...PRINCIPLE },
    ],
    error,
    result: {
      id: raw.id,
      expect,
      joined: verdict.joined,
      reject: verdict.reject,
      mismatch: verdict.mismatch,
      reasons: verdict.reasons,
    },
  });

  if (args.json) process.stdout.write(JSON.stringify(body) + "\n");
  else {
    console.log(
      `${ok ? "PASS" : "FAIL"} ${raw.id} joined=${verdict.joined} mismatch=${verdict.mismatch} reasons=${JSON.stringify(verdict.reasons)}`,
    );
  }
  process.exitCode = exit;
}

main();
