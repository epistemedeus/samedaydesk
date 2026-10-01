#!/usr/bin/env node
/**
 * Caller-first CLI: given one fixture card, print Packet with three dimensions
 * and doNotStartWork. Never bids, claims, or pays.
 *
 *   node src/cli.ts packet --card fixtures/s282/claimable-funded-open.card.json
 *   node src/cli.ts example
 */

import { scoreCardFile } from "./packet.ts";
import { TEST_NOW } from "./constants.ts";
import { resolveCardPath } from "./paths.ts";
import { join } from "node:path";
import { PACK_ROOT } from "./paths.ts";

function usage(): never {
  console.error(`Usage:
  node src/cli.ts packet --card <file> [--now ISO]
  node src/cli.ts example
  node src/cli.ts help`);
  process.exit(2);
}

function parseArgs(argv: string[]): { cmd: string; card?: string; now?: string } {
  const [cmd, ...rest] = argv;
  if (!cmd || cmd === "help" || cmd === "-h" || cmd === "--help") return { cmd: "help" };
  const out: { cmd: string; card?: string; now?: string } = { cmd };
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === "--card" || a === "--fixture") {
      out.card = rest[++i];
    } else if (a === "--now") {
      out.now = rest[++i];
    } else if (a && !a.startsWith("-") && !out.card) {
      out.card = a;
    }
  }
  return out;
}

function printEnvelope(path: string, now?: string): void {
  const envelope = scoreCardFile(resolveCardPath(path), { now: now || TEST_NOW });
  console.log(
    JSON.stringify(
      {
        fixture: path,
        doNotStartWork: envelope.doNotStartWork,
        packet: envelope.packet,
        card: envelope.card,
        warnings: envelope.warnings,
        diagnostics: {
          mixedScoreIsDisplayOnly: envelope.diagnostics.mixedScoreIsDisplayOnly,
          reasons: envelope.diagnostics.reasons,
          winProbabilityGuess: envelope.diagnostics.winProbabilityGuess || null,
        },
      },
      null,
      2,
    ),
  );
}

export function main(argv = process.argv.slice(2)): void {
  const args = parseArgs(argv);
  if (args.cmd === "help") usage();
  if (args.cmd === "packet") {
    if (!args.card) usage();
    printEnvelope(args.card, args.now);
    return;
  }
  if (args.cmd === "example") {
    const claimable = join(PACK_ROOT, "fixtures/s282/claimable-funded-open.card.json");
    const refuse = join(PACK_ROOT, "fixtures/s282/refuse-expired-open.card.json");
    const a = scoreCardFile(claimable, { now: args.now || TEST_NOW });
    const b = scoreCardFile(refuse, { now: args.now || TEST_NOW });
    console.log(
      JSON.stringify(
        {
          now: args.now || TEST_NOW,
          claimable: {
            fixture: "fixtures/s282/claimable-funded-open.card.json",
            doNotStartWork: a.doNotStartWork,
            eligibility: a.packet.eligibility,
            funding: a.packet.funding,
            effort: a.packet.effort,
            mixedScore: a.packet.mixedScore,
          },
          refuse: {
            fixture: "fixtures/s282/refuse-expired-open.card.json",
            doNotStartWork: b.doNotStartWork,
            eligibility: b.packet.eligibility,
            funding: b.packet.funding,
            effort: b.packet.effort,
            mixedScore: b.packet.mixedScore,
          },
        },
        null,
        2,
      ),
    );
    return;
  }
  usage();
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("cli.ts")) {
  try {
    main();
  } catch (err) {
    const e = err as { code?: string; message?: string };
    console.error(JSON.stringify({ error: e.code || "error", message: e.message || String(err) }));
    process.exit(1);
  }
}
