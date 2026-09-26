#!/usr/bin/env node
/**
 * Portable CLI for the Exchange × TownSquare lab pack (S181).
 *
 *   node src/cli.mjs preflight
 *   node src/cli.mjs demo [--mode happy|objective_auto|correction|reject]
 *   node src/cli.mjs run --input <supplied.json> [--receipt out.json] [--clock iso]
 *   node src/cli.mjs import --input <supplied.json>   (alias of run)
 *   node src/cli.mjs replay --receipt <receipt.json> --input <exchangeInput.json>
 *
 * demo loads bundled fixtures and a deterministic demo clock.
 * run/import never load those fixtures and default to current time unless --clock is injected.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

function refuseAliasedWritePaths(labeled) {
  const resolved = [];
  for (const [label, value] of labeled) {
    if (typeof value !== "string") continue;
    resolved.push([label, resolve(value)]);
  }
  for (let i = 0; i < resolved.length; i += 1) {
    for (let j = i + 1; j < resolved.length; j += 1) {
      if (resolved[i][1] === resolved[j][1]) {
        console.error(`${resolved[i][0]} and ${resolved[j][0]} must be distinct paths`);
        process.exit(2);
      }
    }
  }
}

import {
  DEMO_CLOCK_ISO,
  DEMO_CLOCK_MS,
  PACKAGE_ID,
  preflightExchangePackageSync,
  runComposedLabJourney,
} from "./composed-journey.mjs";
import { runSuppliedExchangeJourney, verifySuppliedReceipt } from "./real-journey.mjs";

function load(path) {
  return JSON.parse(readFileSync(resolve(path), "utf8"));
}

function usage() {
  console.error(`Usage:
  node src/cli.mjs preflight
  node src/cli.mjs demo [--mode happy|objective_auto|correction|reject] [--receipt out.json]
  node src/cli.mjs run --input <supplied.json> [--receipt out.json] [--clock iso] [--input-out exchangeInput.json]
  node src/cli.mjs import --input <supplied.json> [--receipt out.json] [--clock iso]
  node src/cli.mjs replay --receipt <receipt.json> --input <exchangeInput.json> [--clock iso]

Package: ${PACKAGE_ID}
demo is fixture_demo only (default clock ${DEMO_CLOCK_ISO}).
run/import require caller-supplied requirements, proposals, and artifacts (clock defaults to now).
TownSquare conversation extraction is synthetic-kit only (source.kind=townsquare_synthetic_conversation, demo:true).
No escrow, token, payment backend, or external-customer claims.`);
}

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const val = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true;
      out[key] = val;
    } else {
      out._.push(a);
    }
  }
  return out;
}

function summarize(result) {
  return {
    packageId: result.packageId,
    schema: result.schema,
    ok: result.ok,
    gated: result.gated,
    outcome: result.outcome,
    outcomeReason: result.outcomeReason,
    acceptanceKind: result.acceptanceKind,
    selectedProposalId: result.selectedProposalId ?? result.exchange?.selectedProposalId ?? null,
    provenance: result.provenance,
    completionLabel: result.completionLabel,
    localRunOk: result.localRunOk === true,
    actualCompletion: result.actualCompletion === true,
    townsquare: result.townsquare,
    declaredSourceIdentity: result.declaredSourceIdentity ?? null,
    checks: result.checks ?? result.exchange?.checks ?? null,
    correction: result.correction ?? result.exchange?.correction ?? null,
    admission: result.admission ?? result.exchange?.admission ?? null,
    gate: result.gate ?? result.exchange?.gate ?? null,
    exchange: result.exchange
      ? {
          ok: result.exchange.ok,
          outcome: result.exchange.outcome,
          outcomeReason: result.exchange.outcomeReason,
          taskId: result.exchange.taskId,
          selectedProposalId: result.exchange.selectedProposalId ?? null,
          proposalId: result.exchange.proposalId,
          boundArtifactSha256: result.exchange.boundArtifactSha256 ?? null,
          lifecycle: result.exchange.lifecycle,
          correction: result.exchange.correction ?? null,
          admission: result.exchange.admission ?? null,
          checks: result.exchange.checks ?? null,
          gate: result.exchange.gate ?? null,
        }
      : null,
    replay: result.replay,
    stages: result.stages,
    note: result.note,
    detail: result.detail || undefined,
    expected: result.expected,
    provided: result.provided,
    error: result.error,
    errorCode: result.errorCode,
  };
}

function clockFromArgs(args, { demo = false, receipt = null } = {}) {
  if (typeof args.clock === "string") {
    const ms = Date.parse(args.clock);
    if (Number.isNaN(ms)) {
      console.error("invalid --clock ISO timestamp");
      process.exit(2);
    }
    return () => ms;
  }
  if (demo) return () => DEMO_CLOCK_MS;
  if (receipt?.createdAt) {
    const ms = Date.parse(receipt.createdAt);
    if (!Number.isNaN(ms)) return () => ms;
  }
  return () => Date.now();
}

function exitFrom(result) {
  if (result.gated) process.exit(2);
  process.exit(result.ok ? 0 : 1);
}

const args = parseArgs(process.argv.slice(2));
const cmd = args._[0];

if (!cmd || !["preflight", "demo", "run", "import", "replay"].includes(cmd)) {
  usage();
  process.exit(2);
}

if (cmd === "preflight") {
  const acq = preflightExchangePackageSync();
  console.log(JSON.stringify(acq, null, 2));
  process.exit(acq.ok ? 0 : 2);
}

if (cmd === "replay") {
  if (!args.receipt || args.input === undefined) {
    console.error("replay requires --receipt and --input");
    process.exit(2);
  }
  if (args.input === true) {
    console.error("replay --input requires a path");
    process.exit(2);
  }
  const receipt = load(args.receipt);
  const input = load(args.input);
  const clock = clockFromArgs(args, { receipt });
  const verified = verifySuppliedReceipt(receipt, input, { clock });
  console.log(JSON.stringify(verified, null, 2));
  process.exit(verified.replayMatched ? 0 : 1);
}

if (cmd === "demo") {
  if (args.conversation || args.input) {
    console.error("demo ignores caller JSON. Use run --input for supplied tasks.");
    process.exit(2);
  }
  refuseAliasedWritePaths([["--receipt", args.receipt]]);
  const mode = typeof args.mode === "string" ? args.mode : "happy";
  const clock = clockFromArgs(args, { demo: true });
  const result = runComposedLabJourney({ mode, clock });
  if (args.receipt) {
    writeFileSync(resolve(args.receipt), `${JSON.stringify(result.receipt, null, 2)}\n`);
  }
  console.log(JSON.stringify(summarize(result), null, 2));
  exitFrom(result);
}

if (cmd === "run" || cmd === "import") {
  if (args.conversation && !args.input) {
    console.error(
      "run/import do not extract arbitrary conversations. Pass --input <supplied.json> with requirements, proposals, and artifact. Optional source.kind=townsquare_synthetic_conversation still requires conversation.demo:true and does not invent exchange criteria.",
    );
    process.exit(2);
  }
  if (!args.input || args.input === true) {
    console.error("run/import requires --input <supplied.json>");
    process.exit(2);
  }
  refuseAliasedWritePaths([
    ["--input", args.input],
    ["--receipt", args.receipt],
    ["--input-out", args["input-out"]],
  ]);
  const clock = clockFromArgs(args, { demo: false });
  const result = runSuppliedExchangeJourney(load(args.input), { clock });
  if (args.receipt) {
    writeFileSync(resolve(args.receipt), `${JSON.stringify(result.receipt, null, 2)}\n`);
  }
  if (args["input-out"] && result.exchangeInput) {
    writeFileSync(resolve(args["input-out"]), `${JSON.stringify(result.exchangeInput, null, 2)}\n`);
  }
  console.log(JSON.stringify(summarize(result), null, 2));
  exitFrom(result);
}
