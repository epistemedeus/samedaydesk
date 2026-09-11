#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { startPublicOrigin } from "../lib/public-http.mjs";
import { discoverOffer } from "../lib/offer.mjs";
import { FIRST_OFFER, QA } from "../lib/repo.mjs";
import { runOwnerQaJourney } from "../lib/journey.mjs";

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) out[key] = true;
      else {
        out[key] = next;
        i += 1;
      }
    } else out._.push(a);
  }
  return out;
}

function usage() {
  return `w5-d25 buyer journey harness (owner QA, not a customer)

Commands:
  offer     HTTP catalog + D01 CLI list join for the first offer
  journey   Two controlled jobs: supplied input then return with changed after

Examples:
  node bin/buyer-journey.mjs offer
  node bin/buyer-journey.mjs journey --out-dir /tmp/w5-d25-owner-qa

Live settlement, payout, deploy, and unsolicited messages are out of scope.
`;
}

const args = parseArgs(process.argv.slice(2));
const cmd = args._[0] || "help";

if (cmd === "help" || cmd === "--help" || cmd === "-h") {
  process.stdout.write(usage());
  process.exit(0);
}

if (cmd === "offer") {
  const http = await startPublicOrigin();
  try {
    const offer = await discoverOffer(http.origin, args.job || FIRST_OFFER);
    process.stdout.write(
      `${JSON.stringify(
        {
          ok: offer.advertised,
          qa: QA,
          jobId: offer.jobId,
          advertised: offer.advertised,
          catalogJobs: offer.catalogJobs,
          listedJobs: offer.listedJobs,
          purchaseAuthority: offer.purchaseAuthority,
          liveSettlement: offer.liveSettlement,
          outputs: offer.outputs,
        },
        null,
        2,
      )}\n`,
    );
    process.exit(offer.advertised ? 0 : 2);
  } finally {
    await http.stop();
  }
}

if (cmd !== "journey") {
  process.stderr.write(`unknown command ${cmd}\n`);
  process.stdout.write(usage());
  process.exit(2);
}

const outDir = args["out-dir"] ? resolve(String(args["out-dir"])) : undefined;
if (outDir) mkdirSync(outDir, { recursive: true });
const result = await runOwnerQaJourney({ outBase: outDir, jobId: args.job || FIRST_OFFER });
if (outDir) {
  writeFileSync(resolve(outDir, "journey.json"), `${JSON.stringify(result, null, 2)}\n`);
}
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
process.exit(result.ok ? 0 : 2);
