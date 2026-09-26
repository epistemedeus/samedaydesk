#!/usr/bin/env node
/**
 * Fresh-consumer CLI for R2-CAPABILITIES-04 (cost-aware dry-run comparison).
 *
 *   node src/cli.mjs compare <input.json>
 *   node src/cli.mjs compare -   # read JSON from stdin
 *   node src/cli.mjs demo
 *   node src/cli.mjs validate <input.json>
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildCostDryRunComparison } from "./compare.mjs";
import { COMPARISON_STATUS } from "./constants.mjs";
import { validateCostDryRunInput } from "./validate.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function loadJson(path) {
  if (path === "-" || path === "/dev/stdin") {
    return JSON.parse(readFileSync(0, "utf8"));
  }
  return JSON.parse(readFileSync(path, "utf8"));
}

function usage() {
  console.error(`Usage:
  node src/cli.mjs compare <input.json|->
  node src/cli.mjs validate <input.json|->
  node src/cli.mjs demo`);
  process.exit(2);
}

const [cmd, a] = process.argv.slice(2);
if (!cmd) usage();

try {
  if (cmd === "compare") {
    if (!a) usage();
    const result = buildCostDryRunComparison(loadJson(a));
    console.log(JSON.stringify(result, null, 2));
    if (result.status === COMPARISON_STATUS.REJECTED) process.exit(1);
  } else if (cmd === "validate") {
    if (!a) usage();
    const normalized = validateCostDryRunInput(loadJson(a));
    console.log(JSON.stringify({ ok: true, normalized }, null, 2));
  } else if (cmd === "demo") {
    const fixtures = [
      "positive.json",
      "partial-missing-price.json",
      "external-cost.json",
      "free-unavailable.json",
      "negative-forbidden.json",
    ];
    const results = {};
    for (const name of fixtures) {
      const raw = loadJson(join(root, "fixtures", name));
      const out = buildCostDryRunComparison(raw, {
        clock: () => Date.parse("2026-09-10T12:00:00.000Z"),
      });
      results[name] = {
        status: out.status,
        quoteCount: out.comparisons?.length ?? 0,
        priceStates: (out.comparisons || []).map((c) => c.priceState),
        freeStates: (out.comparisons || []).flatMap((c) =>
          (c.freeAlternatives || []).map((f) => f.state),
        ),
        missingInputs: out.missingInputs ?? [],
        error: out.error ?? null,
        dryRun: out.dryRun === true,
        paidCalls: out.paidCalls,
        hasInvestmentRecommendation: Object.prototype.hasOwnProperty.call(
          out,
          "investmentRecommendation",
        ),
      };
    }
    console.log(
      JSON.stringify(
        {
          schema: "pilot.r2.capabilities.cost_dry_run_comparison.v1",
          demo: true,
          note: "Synthetic fixtures only; no live paid calls.",
          reuseFrom: ["R2-CONSUMER-JOBS-07"],
          results,
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
