#!/usr/bin/env node
/**
 * SDS useful-jobs cold sha+bytes gate.
 * Boundary: tools/verify-sds/useful-jobs-cold/** only.
 * Cite W0-B2 PR148 obtain-archive patterns; never edit tools/verify/**.
 * Never Stripe/x402 pay; never write catalog/public; never --live.
 *
 * Usage:
 *   node tools/verify-sds/useful-jobs-cold/cli.mjs acquire [--json] [--source kit|for-agents]
 *   node tools/verify-sds/useful-jobs-cold/cli.mjs --seeded-failure wrong-sha [--json]
 *   node tools/verify-sds/useful-jobs-cold/cli.mjs --seeded-failure wrong-bytes [--json]
 *   node tools/verify-sds/useful-jobs-cold/cli.mjs run [--json]
 */
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { USEFUL_JOBS_PIN, SEEDED, FEATURE, W0B2_CITE } from "./lib/pin.mjs";
import { envelope, emitEnvelope, exitFor, failError } from "./lib/envelope.mjs";
import { coldAcquire, runHarness } from "./lib/acquire.mjs";
import { refuseLive, refusePayment } from "./lib/refuse.mjs";

const VALUE_FLAGS = Object.freeze({
  source: true,
  dest: true,
  root: true,
  "expected-sha256": true,
  "expected-bytes": true,
  "extract-dir": true,
});

function flagName(token) {
  if (typeof token !== "string" || !token.startsWith("--")) return null;
  const body = token.slice(2);
  const eq = body.indexOf("=");
  return (eq === -1 ? body : body.slice(0, eq)).toLowerCase();
}

function isValueToken(token) {
  return typeof token === "string" && token.length > 0 && !token.startsWith("-");
}

function isLiveFlag(token) {
  const name = flagName(token);
  return name === "live" || (name != null && name.startsWith("live-"));
}

function isPaymentFlag(token) {
  const name = flagName(token);
  if (!name) return false;
  return (
    /^(stripe|x402|checkout|payment|pay|buy|neo|publish)$/.test(name) ||
    name.startsWith("payment") ||
    name.startsWith("stripe") ||
    name.startsWith("x402") ||
    name.startsWith("checkout")
  );
}

export function parseArgs(argv) {
  const out = {
    tokens: [],
    flags: {},
    seededId: null,
    help: false,
    json: true,
    pretty: false,
    liveFlag: null,
    paymentFlag: null,
    missing: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") {
      out.help = true;
      continue;
    }
    if (a === "--json") {
      out.json = true;
      continue;
    }
    if (a === "--pretty") {
      out.pretty = true;
      continue;
    }
    if (a === "--human") {
      out.json = false;
      out.pretty = true;
      continue;
    }
    if (a === "--dry-run") {
      out.flags.dryRun = true;
      continue;
    }
    if (a === "--no-extract") {
      out.flags.extract = false;
      continue;
    }
    if (isLiveFlag(a)) {
      out.liveFlag = a;
      continue;
    }
    if (isPaymentFlag(a)) {
      out.paymentFlag = a;
      continue;
    }

    const name = flagName(a);
    const eq = typeof a === "string" ? a.indexOf("=") : -1;
    const inline = eq >= 2 && a.startsWith("--") ? a.slice(eq + 1) : null;

    if (name === "seeded-failure") {
      const value = inline != null ? inline : argv[i + 1];
      if (inline == null && isValueToken(argv[i + 1])) i++;
      if (!isValueToken(value)) out.missing = "--seeded-failure";
      else out.seededId = value;
      continue;
    }

    if (name && VALUE_FLAGS[name]) {
      const value = inline != null ? inline : argv[i + 1];
      if (inline == null && isValueToken(argv[i + 1])) i++;
      if (!isValueToken(value)) out.missing = `--${name}`;
      else out.flags[name] = value;
      continue;
    }

    if (typeof a === "string" && a.startsWith("--")) {
      out.unknownFlag = a;
      continue;
    }

    out.tokens.push(a);
  }
  return out;
}

function usage() {
  return `sds useful-jobs-cold — cold acquire/verify useful-jobs ${USEFUL_JOBS_PIN.version}

Pin: sha256 ${USEFUL_JOBS_PIN.sha256}
     bytes  ${USEFUL_JOBS_PIN.bytes}

Commands:
  acquire                 cold copy kit|for-agents archive → dest outside repo; exit 0 JSON
  run                     cold acquire + seeded wrong-sha/wrong-bytes harness
  cite                    print W0-B2 cite + pin (no I/O)

Seeded failures (exit ≠ 0; remaps obtain-archive child exit 0):
  --seeded-failure wrong-sha
  --seeded-failure wrong-bytes
  --seeded-failure sha-mismatch   (alias of wrong-sha)
  --seeded-failure live
  --seeded-failure payment

Options:
  --source kit|for-agents   archive twin (default kit)
  --dest PATH               must be outside repo
  --dry-run                 print argv only
  --json / --pretty

Never: Stripe/x402 pay, catalog/public writes, --live, neo, publish, checkout.
Cite: PR${W0B2_CITE.pr} ${W0B2_CITE.branch} (patterns only).
Feature: ${FEATURE}
`;
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.help) {
    process.stdout.write(usage());
    process.exit(0);
  }

  if (parsed.liveFlag || parsed.seededId === "live") {
    const env = refuseLive({ flag: parsed.liveFlag || `--seeded-failure ${parsed.seededId}` });
    emitEnvelope(env, { pretty: parsed.pretty });
    process.exit(exitFor(env));
  }

  if (parsed.paymentFlag || parsed.seededId === "payment") {
    const env = refusePayment({
      flag: parsed.paymentFlag || `--seeded-failure ${parsed.seededId}`,
    });
    emitEnvelope(env, { pretty: parsed.pretty });
    process.exit(exitFor(env));
  }

  if (parsed.missing) {
    const env = envelope({
      ok: false,
      command: "usage",
      status: "usage",
      error: failError("USAGE", `missing value for ${parsed.missing}`),
    });
    emitEnvelope(env, { pretty: parsed.pretty });
    process.exit(exitFor(env));
  }

  if (parsed.unknownFlag) {
    const env = envelope({
      ok: false,
      command: "usage",
      status: "usage",
      error: failError("USAGE", `unknown flag: ${parsed.unknownFlag}`),
    });
    emitEnvelope(env, { pretty: parsed.pretty });
    process.exit(exitFor(env));
  }

  const cmd = parsed.tokens[0] || (parsed.seededId ? "seeded" : "acquire");

  let env;
  if (cmd === "cite") {
    env = envelope({
      ok: true,
      command: "cite",
      result: {
        pin: USEFUL_JOBS_PIN,
        seeded: Object.keys(SEEDED),
        w0b2: W0B2_CITE,
        writeBoundary: "tools/verify-sds/useful-jobs-cold/**",
      },
    });
  } else if (cmd === "run") {
    env = runHarness({
      root: parsed.flags.root,
      source: parsed.flags.source,
    });
  } else if (cmd === "acquire" || cmd === "seeded") {
    env = coldAcquire({
      root: parsed.flags.root,
      source: parsed.flags.source,
      dest: parsed.flags.dest,
      dryRun: parsed.flags.dryRun,
      extract: parsed.flags.extract,
      extractDir: parsed.flags["extract-dir"],
      seededId: parsed.seededId,
      expectedSha256: parsed.flags["expected-sha256"],
      expectedBytes: parsed.flags["expected-bytes"],
    });
  } else {
    env = envelope({
      ok: false,
      command: cmd,
      status: "usage",
      error: failError("USAGE", `unknown command: ${cmd}`),
    });
  }

  emitEnvelope(env, { pretty: parsed.pretty, human: true });
  process.exit(exitFor(env));
}

function isDirectRun() {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return import.meta.url === pathToFileURL(resolve(entry)).href;
  } catch {
    return false;
  }
}

if (isDirectRun()) {
  main().catch((err) => {
    const env = envelope({
      ok: false,
      command: "runtime",
      status: "error",
      error: failError("RUNTIME", err.message || String(err)),
    });
    emitEnvelope(env, { pretty: false });
    process.exit(exitFor(env));
  });
}
