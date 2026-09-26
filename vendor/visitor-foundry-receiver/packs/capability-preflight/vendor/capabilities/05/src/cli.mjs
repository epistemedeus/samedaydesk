#!/usr/bin/env node
/**
 * Fresh-consumer CLI for R2-CAPABILITIES-05 (failure fallback plan).
 *
 *   node src/cli.mjs plan <input.json>
 *   node src/cli.mjs plan -   # read JSON from stdin
 *   node src/cli.mjs demo
 *   node src/cli.mjs validate <input.json>
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PLAN_STATUS } from "./constants.mjs";
import { buildFailureFallbackPlan } from "./plan.mjs";
import { validateFailureOutcome } from "./validate.mjs";

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
  node src/cli.mjs plan <input.json|->
  node src/cli.mjs validate <input.json|->
  node src/cli.mjs demo`);
  process.exit(2);
}

const [cmd, a] = process.argv.slice(2);
if (!cmd) usage();

try {
  if (cmd === "plan") {
    if (!a) usage();
    const result = buildFailureFallbackPlan(loadJson(a));
    console.log(JSON.stringify(result, null, 2));
    if (result.status === PLAN_STATUS.REJECTED) process.exit(1);
  } else if (cmd === "validate") {
    if (!a) usage();
    const normalized = validateFailureOutcome(loadJson(a));
    console.log(JSON.stringify({ ok: true, normalized }, null, 2));
  } else if (cmd === "demo") {
    const fixtures = [
      "positive-known-mutation.json",
      "ambiguous-mutation.json",
      "partial-missing-fields.json",
      "negative-forbidden.json",
      "free-baseline-hint.json",
    ];
    const results = {};
    for (const name of fixtures) {
      const raw = loadJson(join(root, "fixtures", name));
      const out = buildFailureFallbackPlan(raw, {
        clock: () => Date.parse("2026-09-10T12:00:00.000Z"),
      });
      results[name] = {
        status: out.status,
        failureClass: out.failureClass,
        mutationState: out.mutationState,
        stepKinds: (out.steps || []).map((s) => s.kind),
        missingInputs: (out.missingInputs || []).map((m) => (typeof m === "string" ? m : m.id)),
        mutationPreservation: out.mutationPreservation
          ? {
              mutationState: out.mutationPreservation.mutationState,
              rolled_back: out.mutationPreservation.rolled_back,
              sideEffectsClean: out.mutationPreservation.sideEffectsClean,
              preserveAmbiguity: out.mutationPreservation.preserveAmbiguity,
            }
          : null,
        error: out.error ?? null,
        dryRun: out.dryRun === true,
        paidCalls: out.paidCalls,
        providerNeutral: out.providerNeutral === true,
        hasProviderBrand: Object.prototype.hasOwnProperty.call(out, "providerBrand"),
      };
    }
    console.log(
      JSON.stringify(
        {
          schema: "pilot.r2.capabilities.failure_fallback_plan.v1",
          demo: true,
          note: "Synthetic fixtures only; dry-run plan; no live retries or paid calls.",
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
