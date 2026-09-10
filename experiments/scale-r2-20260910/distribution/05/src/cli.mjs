#!/usr/bin/env node
/**
 * Fresh-consumer CLI for R2-DISTRIBUTION-05.
 *
 *   node src/cli.mjs demo
 *   node src/cli.mjs collect <events.json>
 *   node src/cli.mjs validate <summary.json>
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { EARNINGS_STATUS, SUMMARY_STATUS } from "./constants.mjs";
import { collectReadback } from "./collect.mjs";
import { validateSummary } from "./validate.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function loadJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function usage() {
  console.error(`Usage:
  node src/cli.mjs demo
  node src/cli.mjs collect <events.json>
  node src/cli.mjs validate <summary.json>`);
  process.exit(2);
}

const [cmd, a] = process.argv.slice(2);
if (!cmd) usage();

const clock = () => Date.parse("2026-09-10T19:15:00.000Z");

try {
  if (cmd === "collect") {
    if (!a) usage();
    const summary = collectReadback(loadJson(a), { clock });
    console.log(JSON.stringify(summary, null, 2));
    const bad = [SUMMARY_STATUS.PARTIAL, SUMMARY_STATUS.UNAVAILABLE].includes(summary.status);
    process.exit(bad ? 1 : 0);
  } else if (cmd === "validate") {
    if (!a) usage();
    const summary = validateSummary(loadJson(a));
    console.log(
      JSON.stringify(
        {
          ok: true,
          status: summary.status,
          providersAccepted: summary.providersAccepted || null,
          countsByKind: summary.countsByKind || null,
          countsByProvider: summary.countsByProvider || null,
          installCount: Object.prototype.hasOwnProperty.call(summary, "installCount")
            ? summary.installCount
            : null,
          runCount: Object.prototype.hasOwnProperty.call(summary, "runCount")
            ? summary.runCount
            : null,
          hasInstallCount: Object.prototype.hasOwnProperty.call(summary, "installCount"),
          hasRunCount: Object.prototype.hasOwnProperty.call(summary, "runCount"),
          earningsStatus: summary.earnings?.status ?? null,
          earningsAmountCount: summary.earnings?.amounts?.length ?? 0,
          pricingObserved: summary.pricingObserved || [],
          schema: summary.schema,
        },
        null,
        2,
      ),
    );
  } else if (cmd === "demo") {
    const positive = collectReadback(loadJson(join(root, "fixtures/events.positive.json")), {
      clock,
    });
    const partial = collectReadback(loadJson(join(root, "fixtures/events.partial.json")), {
      clock,
    });
    const unavailable = collectReadback(
      loadJson(join(root, "fixtures/events.unavailable.json")),
      { clock },
    );
    const noUsers = collectReadback(loadJson(join(root, "fixtures/events.no-users.json")), {
      clock,
    });
    const outPath = "/tmp/r2-dist-05-summary.json";
    writeFileSync(outPath, JSON.stringify(positive, null, 2));
    console.log(
      JSON.stringify(
        {
          positive: {
            status: positive.status,
            countsByKind: positive.countsByKind,
            countsByProvider: positive.countsByProvider,
            lastObserved: positive.lastObserved,
            installCount: positive.installCount,
            runCount: positive.runCount,
            earningsStatus: positive.earnings?.status,
            earningsAmounts: positive.earnings?.amounts,
            pricingObserved: positive.pricingObserved,
            grexalListed: positive.countsByKind?.listed >= 1,
            grexalRun: positive.countsByKind?.run >= 1,
            agensiReviewed: positive.countsByKind?.reviewed >= 1,
            grexalRunCompletedUsd: positive.pricingObserved?.[0]?.run_completed_usd ?? null,
          },
          partial: {
            status: partial.status,
            missingInputs: partial.missingInputs,
          },
          unavailable: {
            status: unavailable.status,
            hasInstallCount: Object.prototype.hasOwnProperty.call(unavailable, "installCount"),
            hasRunCount: Object.prototype.hasOwnProperty.call(unavailable, "runCount"),
            earningsStatus: unavailable.earnings?.status,
          },
          noUsers: {
            status: noUsers.status,
            installCount: noUsers.installCount,
            runCount: noUsers.runCount,
            earningsStatus: noUsers.earnings?.status,
            pricingObserved: noUsers.pricingObserved,
          },
          distinct:
            unavailable.status === SUMMARY_STATUS.UNAVAILABLE &&
            noUsers.status === SUMMARY_STATUS.NO_USERS &&
            unavailable.status !== noUsers.status,
          noSyntheticRevenue:
            positive.earnings?.status === EARNINGS_STATUS.UNAVAILABLE &&
            (positive.earnings?.amounts?.length ?? 0) === 0,
          pricingIsNotEarnings:
            positive.pricingObserved?.[0]?.run_completed_usd === 0.02 &&
            positive.earnings?.status === EARNINGS_STATUS.UNAVAILABLE &&
            (positive.earnings?.amounts?.length ?? 0) === 0,
          unavailableEarningsNotZeroRevenue:
            positive.earnings?.status === EARNINGS_STATUS.UNAVAILABLE &&
            positive.earnings?.zeroRevenueClaim !== true,
          wroteSummary: outPath,
          mutationBoundary: positive.mutationBoundary,
        },
        null,
        2,
      ),
    );
  } else {
    usage();
  }
} catch (err) {
  console.error(
    JSON.stringify({
      error: err.code || "error",
      message: err.message,
      details: err.details || null,
    }),
  );
  process.exit(1);
}
