#!/usr/bin/env node
/**
 * SDS useful-jobs cold sha+bytes gate.
 * Boundary: tools/verify-sds/useful-jobs-cold/** only.
 * Cite W0-B2 PR148 obtain-archive patterns; never edit tools/verify/**.
 * Never Stripe/x402 pay; never write catalog/public.
 *
 * Usage:
 *   node tools/verify-sds/useful-jobs-cold/cli.mjs acquire [--json] [--source kit|for-agents]
 *   node tools/verify-sds/useful-jobs-cold/cli.mjs --seeded-failure wrong-sha [--json]
 *   node tools/verify-sds/useful-jobs-cold/cli.mjs --seeded-failure wrong-bytes [--json]
 *   node tools/verify-sds/useful-jobs-cold/cli.mjs run [--json]
 */
import { USEFUL_JOBS_PIN, SEEDED, FEATURE, W0B2_CITE } from "./lib/pin.mjs";
import { envelope, emitEnvelope, exitFor, failError } from "./lib/envelope.mjs";
import { coldAcquire, runHarness } from "./lib/acquire.mjs";

function parseArgs(argv) {
  const out = {
    tokens: [],
    flags: {},
    seededId: null,
    help: false,
    json: true,
    pretty: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") out.help = true;
    else if (a === "--json") out.json = true;
    else if (a === "--pretty") out.pretty = true;
    else if (a === "--human") out.json = false;
    else if (a === "--dry-run") out.flags.dryRun = true;
    else if (a === "--seeded-failure") {
      out.seededId = argv[++i];
      if (!out.seededId) out.missing = "--seeded-failure";
    } else if (a === "--source") {
      out.flags.source = argv[++i];
      if (!out.flags.source) out.missing = "--source";
    } else if (a === "--dest") {
      out.flags.dest = argv[++i];
      if (!out.flags.dest) out.missing = "--dest";
    } else if (a === "--root") {
      out.flags.root = argv[++i];
      if (!out.flags.root) out.missing = "--root";
    } else if (a === "--no-extract") {
      out.flags.extract = false;
    } else if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        out.flags[key] = next;
        i++;
      } else {
        out.flags[key] = true;
      }
    } else {
      out.tokens.push(a);
    }
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

Options:
  --source kit|for-agents   archive twin (default kit)
  --dest PATH               must be outside repo
  --dry-run                 print argv only
  --json / --pretty

Never: Stripe/x402 pay, catalog/public writes.
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
