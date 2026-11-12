#!/usr/bin/env node
/**
 * Direct baseline: the same accepted, retry and changed-schema periods posted straight
 * to the SameDayDesk client endpoint with no workflow platform (src/direct-journey.mjs).
 * Measured by local simulation. compute-comparison.mjs uses directRow() for the
 * `direct` row of COMPARISON.json; the vendored native row is never touched.
 *
 *   node scripts/direct-baseline.mjs   print the direct row and its measurements
 */
import { fileURLToPath } from "node:url";

import { runDirectJourney } from "../src/direct-journey.mjs";

const CODES = "typed period.exception.code from the SameDayDesk client endpoint (same vendored journey as native)";

export function directRow() {
  const run = runDirectJourney();
  const s = run.steps;
  const exceptions = [s.staleCapture, s.uncommitted, s.nonRetryable, s.schemaChanged]
    .map((step) => `${step.exception} retryable ${step.retryable}`);
  return {
    steps: `${run.acceptedPathSteps} calls on the accepted path: ${run.acceptedPath.join(" > ")}`,
    failureHandling: `0 platform branches; the caller reads period.exception.code and period.retry.retryable (${exceptions.join(", ")}); ${CODES}`,
    recovery: `${run.retrySteps} call on the retry route (${run.retryPath.join(" > ")}); replay recovered ${s.replay.recovered}, secondEffect ${s.replay.secondEffect}; uncommitted then committed on the same key ${s.uncommitted.sameIdempotencyKey === s.accepted.idempotencyKey}; changed schema recovered by the declared adapter ${s.adapted.adapter} on a new key`,
    duplicateEffects: `${run.duplicateEffects}: ${run.totalCalls} calls over ${run.acceptedKeys} accepted keys gave ${run.acceptanceEffects} acceptance effects and ${run.deliveries} deliveries`,
    source: "measured by local simulation: scripts/direct-baseline.mjs posts to src/client-endpoint.mjs with no workflow platform; synthetic fixtures; not a live run",
    measured: {
      acceptedPathSteps: run.acceptedPathSteps,
      acceptedPath: run.acceptedPath,
      retrySteps: run.retrySteps,
      retryPath: run.retryPath,
      totalCalls: run.totalCalls,
      acceptedKeys: run.acceptedKeys,
      acceptanceEffects: run.acceptanceEffects,
      deliveries: run.deliveries,
      duplicateEffects: run.duplicateEffects,
      periods: Object.fromEntries(Object.entries(s).map(([name, step]) => [name, {
        status: step.status,
        decision: step.decision,
        exception: step.exception,
        retryable: step.retryable,
        recovered: step.recovered,
        secondEffect: step.secondEffect,
        duplicate: step.duplicate,
        adapter: step.adapter,
      }])),
    },
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.stdout.write(`${JSON.stringify(directRow(), null, 2)}\n`);
}
