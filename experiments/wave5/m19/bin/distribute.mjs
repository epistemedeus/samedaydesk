#!/usr/bin/env node
import {
  applyProtectedSurface,
  consumeLatest,
  invokeSelectedOffer,
  reportError,
  runJourney,
  submitContribution,
} from "../lib/integrate.mjs";
import { collectEvents, selectContribution } from "../lib/events.mjs";
import { outreachRefusal } from "../lib/refuse.mjs";

function parseArgs(argv) {
  const out = { _: [], flags: {} };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) out.flags[key] = true;
      else {
        out.flags[key] = next;
        i += 1;
      }
    } else out._.push(a);
  }
  return out;
}

function usage() {
  return `m19-distribute — one maintained distribution integration (dry-run)

Commands:
  events
  select [--surface mcp-registry]
  submit [--apply] [--live] [--surface mcp-registry|bazaar|mpp]
  consume [--snapshot mcp-registry-consumer-2026-09-09|presence-fixture-2026-09-03] [--naive-unfiltered]
  invoke [--example]
  journey [--apply] [--example]
  scan

Nothing is published. --live is refused. Postgres is unused.
`;
}

const args = parseArgs(process.argv.slice(2));
const cmd = args._[0] || "help";

try {
  if (cmd === "help" || cmd === "--help" || cmd === "-h") {
    process.stdout.write(usage());
    process.exit(0);
  }

  let result;
  if (cmd === "events") result = await collectEvents();
  else if (cmd === "select") {
    const events = await collectEvents();
    result = await selectContribution(events, {
      surface: args.flags.surface || "mcp-registry",
      kind: args.flags.kind,
    });
  } else if (cmd === "submit") {
    if (args.flags.surface && args.flags.surface !== "mcp-registry") {
      result = await applyProtectedSurface(args.flags.surface);
    } else {
      const events = await collectEvents();
      const contribution = await selectContribution(events);
      result = await submitContribution(contribution, {
        apply: args.flags.apply === true,
        live: args.flags.live === true,
      });
    }
  } else if (cmd === "consume") {
    result = await consumeLatest({
      snapshot: args.flags.snapshot,
      naiveUnfiltered: args.flags["naive-unfiltered"] === true,
    });
  } else if (cmd === "invoke") {
    result = invokeSelectedOffer({ example: args.flags.example === true });
  } else if (cmd === "journey") {
    result = await runJourney({
      apply: args.flags.apply === true,
      live: args.flags.live === true,
      example: args.flags.example === true,
    });
  } else if (cmd === "scan" || cmd === "outreach") {
    throw outreachRefusal(args.flags.kind || "multi-surface-blast");
  } else {
    process.stderr.write(`unknown command ${cmd}\n${usage()}`);
    process.exit(2);
  }

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.ok === false && result.refused) process.exit(2);
  if (result.ok === false) process.exit(1);
  process.exit(0);
} catch (err) {
  const report = reportError(err);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exit(report.refused ? 2 : 1);
}
