import { writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { rebindMeasuredFiles } from "./rebind-measured.mjs";
import {
  DEFAULT_H04_ROOT,
  DEFAULT_MERCHANT_ROOT,
  ERROR_CODES,
  OWNED_DIR,
  PROPOSED_JOB_ID,
  PROPOSED_PRICE_USDC,
  X402_RAIL_ID,
} from "./pins.mjs";
import { refuse, ExperimentRefuse } from "./refuse.mjs";
import { listRails } from "./rails.mjs";
import { measureJob } from "./measure.mjs";
import { priceFloor } from "./floor.mjs";
import { runExperiment } from "./experiment.mjs";
import { listen } from "./http.mjs";
import { runLockfileProfile } from "./profile.mjs";
import { buildSourceExport } from "./source-export.mjs";
import { captureEnvironment } from "./env-capture.mjs";

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
  profile [--merchant-root DIR] [--h04-root DIR] [--out-dir DIR]
  lockfile-offer   (same as profile; prints the 0.005 recommendation)
  rebind-measured [--in measured/profile.json] [--out-dir measured]
  source-export
  journey [--buyer-class owner-qa] [--proposed 0.003] [--rail x402-exact-base-usdc]
  measure --job vendor-budget-impact [--example]
  floor --duration-ms N --proposed 0.003 [--rail x402-exact-base-usdc]
  list-rails
  listen [--port 0]

profile mounts epistemedeus/x402-url-extractor POST /lockfile-pin-delta
(ca382052, $0.005, x402-only) against a fake facilitator in a disposable
worktree. It is latency/cost evidence, not a live payment or public loadtest.

rebind-measured reapplies the current offer/source model to an already
captured profile.json. It does not remount the handler or repeat CPU/wall/RSS.

journey is the HISTORICAL F08 0.003 T3/60s assumed scenario. It is not the
live lockfile offer and is not a Railway measurement.
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

  if (cmd === "profile" || cmd === "lockfile-offer") {
    try {
      const outDir = args["out-dir"] ? resolve(String(args["out-dir"])) : join(OWNED_DIR, "measured");
      const result = await runLockfileProfile({
        merchantRoot: args["merchant-root"] ? resolve(String(args["merchant-root"])) : DEFAULT_MERCHANT_ROOT,
        h04Root: args["h04-root"] ? resolve(String(args["h04-root"])) : DEFAULT_H04_ROOT,
        outDir,
      });
      const body = {
        ok: true,
        certifiedNoLoss: false,
        liveLockfileOffer: true,
        historicalAssumedScenario: false,
        priceChange: false,
        outDir: result.outDir,
        recommendation: result.report.recommendation,
        counts: result.report.counts,
        latencyMs: result.report.latencyMs,
        allocated: {
          hourUsd: result.report.allocated.hour.variableUsd,
          monthUsd: result.report.allocated.monthApprox30d.variableUsd,
          idleRssBytes: result.report.idleRssBytes,
        },
      };
      if (args.out) writeJson(resolve(String(args.out)), result.report);
      process.stdout.write(`${JSON.stringify(body, null, 2)}\n`);
      return 0;
    } catch (err) {
      const body = err instanceof ExperimentRefuse
        ? refuse(err.code, err.message, err.detail)
        : refuse(ERROR_CODES.WRAPPER_FAILURE_IS_NOT_COST_BASIS, err.message || String(err));
      process.stdout.write(`${JSON.stringify(body, null, 2)}\n`);
      return 2;
    }
  }

  if (cmd === "rebind-measured") {
    const outDir = args["out-dir"] ? resolve(String(args["out-dir"])) : join(OWNED_DIR, "measured");
    const inPath = args.in ? resolve(String(args.in)) : join(outDir, "profile.json");
    try {
      const rebound = rebindMeasuredFiles({ inPath, outDir });
      process.stdout.write(`${JSON.stringify({
        ok: true,
        remounted: false,
        repeatedProfile: false,
        priceChange: false,
        inPath,
        outDir,
        reboundAt: rebound.reboundAt,
        reboundFromCapturedAt: rebound.reboundFromCapturedAt,
        productionFacilitator: rebound.recommendation.facilitator.productionFacilitator,
        sourceDefault: rebound.recommendation.facilitator.sourceDefault,
        recommendation: rebound.recommendation.summary,
      }, null, 2)}\n`);
      return 0;
    } catch (err) {
      const body = err instanceof ExperimentRefuse
        ? refuse(err.code, err.message, err.detail)
        : refuse(ERROR_CODES.MISSING_MEASUREMENT, err.message || String(err));
      process.stdout.write(`${JSON.stringify(body, null, 2)}\n`);
      return 2;
    }
  }

  if (cmd === "source-export") {
    const merchantRoot = args["merchant-root"] ? resolve(String(args["merchant-root"])) : DEFAULT_MERCHANT_ROOT;
    const h04Root = args["h04-root"] ? resolve(String(args["h04-root"])) : DEFAULT_H04_ROOT;
    const environment = captureEnvironment({ merchantRoot, h04Root });
    const body = buildSourceExport({ environment, merchantRoot, h04Root });
    process.stdout.write(`${JSON.stringify(body, null, 2)}\n`);
    return 0;
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
