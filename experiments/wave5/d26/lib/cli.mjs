import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { ERROR_CODES, PROPOSED_JOB_ID, PROPOSED_PRICE_USDC, X402_RAIL_ID } from "./pins.mjs";
import { refuse } from "./refuse.mjs";
import { listRails } from "./rails.mjs";
import { measureJob } from "./measure.mjs";
import { priceFloor } from "./floor.mjs";
import { runExperiment } from "./experiment.mjs";
import { listen } from "./http.mjs";

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

export function usage() {
  return `price-floor — W5-D26 service-cost / price-floor kit (not a live sale)

Commands:
  journey [--buyer-class owner-qa] [--proposed 0.003] [--rail x402-exact-base-usdc]
  measure --job vendor-budget-impact [--example]
  floor --duration-ms N --proposed 0.003 [--rail x402-exact-base-usdc]
  list-rails
  listen [--port 0]

Journey runs the current F08 CLI on caller files, applies CDP usage-based
Exact fees plus a conservative AWS T3 CPU-credit compute model, and emits one
non-live proposed offer. Live settlement is out of scope.
`;
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const cmd = args._[0] || "help";

  if (cmd === "help" || cmd === "--help" || cmd === "-h") {
    process.stdout.write(usage());
    return 0;
  }

  if (cmd === "list-rails") {
    process.stdout.write(`${JSON.stringify({ ok: true, rails: listRails() }, null, 2)}\n`);
    return 0;
  }

  if (cmd === "measure") {
    const result = measureJob({
      jobId: args.job || args._[1] || PROPOSED_JOB_ID,
      example: args.example === true,
      funding: args.funding,
      paymentPath: args.payment ? resolve(String(args.payment)) : undefined,
      settle: args.settle === true,
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return result.ok ? 0 : 2;
  }

  if (cmd === "floor") {
    const result = priceFloor({
      railId: args.rail || X402_RAIL_ID,
      proposedPriceUsdc: String(args.proposed || PROPOSED_PRICE_USDC),
      durationMs: Number(args["duration-ms"] || 0),
      feeTier: args["fee-tier"],
      measurementOk: args["measurement-ok"] !== "false",
      certifyAsX402Offer: args["certify-as-x402"] === true,
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return result.ok ? 0 : 2;
  }

  if (cmd === "journey") {
    const result = runExperiment({
      buyerClass: args["buyer-class"] || "owner-qa",
      jobId: args.job || PROPOSED_JOB_ID,
      railId: args.rail || X402_RAIL_ID,
      proposedPriceUsdc: args.proposed ? String(args.proposed) : PROPOSED_PRICE_USDC,
      example: args.example === true,
      settle: args.settle === true,
      feeTier: args["fee-tier"],
      citedBankedAsCostCover: args["cited-banked-as-cost-cover"] === true,
      includeOperation: args["include-operation"],
      forceUnlikeUnitsEqual: args["force-unlike-units-equal"] === true,
      certifyAsX402Offer: args["certify-as-x402"] === true,
      independentDemand: args["independent-demand"] === true,
      rewriteLiveExtract: args["rewrite-live-extract"] === true,
      confirmJob: args["skip-confirm"] === true ? false : undefined,
    });
    if (args.out) writeJson(resolve(String(args.out)), result);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return result.ok && result.certified ? 0 : 2;
  }

  if (cmd === "listen") {
    const held = await listen(args.port || 0);
    process.stdout.write(
      `${JSON.stringify({ ok: true, url: held.url, liveSettleAttempted: false }, null, 2)}\n`,
    );
    await new Promise((resolve) => held.server.on("close", resolve));
    return 0;
  }

  process.stderr.write(`unknown command ${cmd}\n`);
  process.stdout.write(usage());
  const body = refuse(ERROR_CODES.UNKNOWN_COMMAND, `unknown command ${cmd}`);
  process.stderr.write(`${JSON.stringify(body)}\n`);
  return 2;
}
