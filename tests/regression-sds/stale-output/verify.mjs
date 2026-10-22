#!/usr/bin/env node
/**
 * Verify one stale-output fixture.
 * Default: expect reject → exit 0 when classifier rejects; exit 1 JSON fail if would accept.
 * --expect accept | --as-accept: treat as accept path (seeded greenwash must exit 1).
 */
import { readFileSync, realpathSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
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

function underRoot(abs, root) {
  const rel = relative(root, abs);
  return rel !== "" && !rel.startsWith("..") && !rel.startsWith("/");
}

function writeBody(args, body, exit) {
  if (args.json) {
    process.stdout.write(JSON.stringify(body) + "\n");
  } else {
    console.log(
      `${body.ok ? "PASS" : "FAIL"} ${body.result?.id || ""} code=${body.error?.code || ""} reject=${body.result?.reject}`,
    );
  }
  process.exitCode = exit;
}

function failEnvelope(args, code, message, extra = {}, exit = 1) {
  const { result, ...rest } = extra;
  writeBody(
    args,
    envelope({
      command: "verify",
      status: "fail",
      ok: false,
      error: { code, message, ...rest },
      result: result || null,
    }),
    exit,
  );
}

function loadFixture(pathArg) {
  if (!pathArg) {
    const err = new Error("missing fixture");
    err.code = "USAGE";
    throw err;
  }
  const requested = resolve(here, pathArg);
  let realRoot;
  let realAbs;
  try {
    realRoot = realpathSync(here);
  } catch (e) {
    const err = new Error(e.message);
    err.code = "FILE_NOT_FOUND";
    throw err;
  }
  try {
    realAbs = realpathSync(requested);
  } catch (e) {
    if (!underRoot(requested, resolve(here))) {
      const err = new Error(`fixture path escapes write boundary: ${pathArg}`);
      err.code = "PATH_REFUSE";
      throw err;
    }
    const err = new Error(`fixture not found: ${pathArg}`);
    err.code = "FILE_NOT_FOUND";
    throw err;
  }
  if (!underRoot(realAbs, realRoot)) {
    const err = new Error(`fixture path escapes write boundary: ${pathArg}`);
    err.code = "PATH_REFUSE";
    throw err;
  }
  let raw;
  try {
    raw = JSON.parse(readFileSync(realAbs, "utf8"));
  } catch (e) {
    const err = new Error(`invalid fixture JSON: ${e.message}`);
    err.code = "INVALID_JSON";
    throw err;
  }
  return { abs: realAbs, raw };
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help || !args.fixture) {
    if (args.json && !args.help) {
      failEnvelope(args, "USAGE", usage(), {}, 2);
      return;
    }
    console.error(usage());
    process.exitCode = args.help ? 0 : 2;
    return;
  }
  if (args.expect !== "accept" && args.expect !== "reject") {
    failEnvelope(args, "USAGE", `invalid --expect ${args.expect}`, {}, 2);
    return;
  }

  let abs;
  let raw;
  try {
    ({ abs, raw } = loadFixture(args.fixture));
  } catch (e) {
    const code = e.code === "PATH_REFUSE" || e.code === "USAGE" ? 2 : 1;
    failEnvelope(args, e.code || "FILE_NOT_FOUND", e.message, {}, code);
    return;
  }
  const output = raw.output || raw;
  const meta = {
    surface: raw.surface || output.surface,
  };
  const verdict = classifyStaleOutput(output, meta);

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
        message: `seeded accept refused: ${raw.id || "case"} is stale/greenwash`,
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

  writeBody(args, body, exit);
}

main();
