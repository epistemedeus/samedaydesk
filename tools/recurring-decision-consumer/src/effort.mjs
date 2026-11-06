import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { directRecurringResult } from "./direct-baseline.mjs";
import { INTENT_SCHEMA, EFFORT_SCHEMA, OUTCOMES } from "./pins.mjs";
import { produceRecurringResult } from "./recurring-result.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(here, "..");

const RETAINED = [
  "src/evaluate.mjs",
  "src/n8n-stored.mjs",
  "src/freshness.mjs",
  "src/state.mjs",
  "src/digest.mjs",
  "src/io.mjs",
  "src/limits.mjs",
  "src/pins.mjs",
];
const SHARED = ["src/schedule.mjs"];
const MAINTAINED = ["src/recurring-result.mjs"];
const DIRECT = ["src/direct-baseline.mjs"];
const MEASUREMENT = ["src/effort.mjs", "src/receipt.mjs"];

function bytes(relativePaths) {
  return relativePaths.reduce((sum, relativePath) => {
    const text = readFileSync(join(packageRoot, relativePath));
    return sum + text.byteLength;
  }, 0);
}

export function classifyOperating(ratio) {
  if (!Number.isFinite(ratio) || ratio <= 0) return { operating: "unmeasured", noChange: false };
  if (ratio >= 0.5 && ratio <= 2) return { operating: "no_material_operating_difference", noChange: true };
  if (ratio < 0.5) return { operating: "maintained_operating_lower", noChange: false };
  return { operating: "direct_operating_lower", noChange: false };
}

export function recurringView(result) {
  if (!result || result.outcome !== "compared") {
    return {
      kind: result?.outcome ?? null,
      ok: result?.ok === true,
      reason: result?.reason ?? null,
      decisions: Array.isArray(result?.decisions) ? result.decisions.length : 0,
      cancelled: result?.cancellation?.cancelled === true,
      standingWatcher: result?.cancellation?.standingWatcher === true,
      preserved: result?.captureDisposition?.preserved === true,
      preservedOutcome: result?.captureDisposition?.outcome ?? null,
      preservedReason: result?.captureDisposition?.reason ?? null,
    };
  }
  return {
    kind: "compared",
    ok: result.ok === true,
    useful: result.useful === true,
    reason: result.reason,
    captureAt: result.capture?.capturedAt ?? null,
    envelope: result.capture?.envelope ?? null,
    captureWithinHorizon: result.freshness?.captureWithinHorizon === true,
    derivedFixture: result.capture?.derivedFixture === true,
    decisions: result.decisions.map((decision) => ({
      intentId: decision.intentId,
      ok: decision.result?.ok === true,
      outcome: decision.result?.outcome ?? null,
      useful: decision.result?.useful === true,
      reason: decision.result?.reason ?? null,
      changed: decision.result?.decision?.changedFields ?? [],
      unchanged: decision.result?.decision?.unchangedFields ?? [],
      absent: decision.result?.decision?.absentFields ?? [],
      withinHorizon: decision.result?.freshness?.withinHorizon === true,
      falseChange: decision.result?.controls?.falseChange === true,
      missedChange: decision.result?.controls?.missedChange === true,
      adapted: decision.adaptation?.applied === true,
      adaptedOutcome: decision.adaptation?.result?.outcome ?? null,
      adaptedFields: decision.adaptation?.changedFields ?? [],
    })),
  };
}

function inputOf(base, overrides = {}) {
  return {
    saved: base.saved,
    nestedSaved: undefined,
    capture: null,
    workflowId: base.workflowId,
    executionId: base.executionId,
    nodeName: base.nodeName,
    intents: base.intents,
    priors: base.priors,
    references: { byIntent: {} },
    clock: base.clock,
    horizonHours: base.horizonHours,
    schedule: base.schedule,
    stateDir: null,
    adapt: false,
    cancel: false,
    ownerQaPriors: true,
    ...overrides,
  };
}

function withHorizon(schedule, horizonHours) {
  const next = structuredClone(schedule);
  next.scope = { ...next.scope, horizonHours };
  return next;
}

function withIntent(base, intent) {
  const schedule = structuredClone(base.schedule);
  schedule.scope = { ...schedule.scope, intentIds: [...schedule.scope.intentIds, intent.intentId] };
  return {
    intents: [...base.intents, intent],
    schedule,
    priors: base.priors,
  };
}

export function buildEffortProbes(base) {
  const staleSchedule = withHorizon(base.schedule, 0);
  const ambiguous = structuredClone(base.saved);
  ambiguous.execution = { ...ambiguous.execution, data: structuredClone(ambiguous.data) };
  const missing = structuredClone(base.saved);
  delete missing.data.resultData.runData[base.nodeName];
  const mismatchSchedule = structuredClone(base.schedule);
  mismatchSchedule.scope = {
    ...mismatchSchedule.scope,
    source: { ...mismatchSchedule.scope.source, executionId: "9" },
  };
  const unsupported = withIntent(base, {
    schema: INTENT_SCHEMA,
    intentId: "watch-other-subject",
    subject: "other-subject",
    fields: ["title"],
    compare: "field_equality",
  });
  const unknown = withIntent(base, {
    schema: INTENT_SCHEMA,
    intentId: "watch-absent-field",
    subject: base.schedule.subject,
    fields: ["notPresent"],
    compare: "field_equality",
  });
  const refused = structuredClone(base.schedule);
  refused.standingWatcher = true;
  return [
    { name: "in-horizon-multi", input: inputOf(base, { adapt: true }) },
    { name: "nested-envelope", input: inputOf(base, { saved: base.nestedSaved, adapt: true }) },
    { name: "stale", input: inputOf(base, { horizonHours: 0, schedule: staleSchedule }) },
    { name: "ambiguous", input: inputOf(base, { saved: ambiguous }) },
    { name: "missing-node", input: inputOf(base, { saved: missing }) },
    { name: "identity-mismatch", input: inputOf(base, { executionId: "9", schedule: mismatchSchedule }) },
    { name: "unsupported", input: inputOf(base, unsupported) },
    { name: "unknown-field", input: inputOf(base, unknown) },
    {
      name: "false-and-missed",
      input: inputOf(base, {
        references: {
          byIntent: {
            "watch-title": { expectedOutcome: OUTCOMES.usefulChange },
            "watch-title-drift": { expectedOutcome: OUTCOMES.usefulNoChange },
          },
        },
      }),
    },
    { name: "cancellation", input: inputOf(base, { cancel: true }) },
    { name: "refused-watcher", input: inputOf(base, { schedule: refused }) },
  ];
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

function timePath(run, probes, iterations) {
  for (let warm = 0; warm < 3; warm += 1) {
    for (const probe of probes) run(probe.input);
  }
  const samples = [];
  for (let index = 0; index < iterations; index += 1) {
    const started = process.hrtime.bigint();
    for (const probe of probes) run(probe.input);
    samples.push(Number(process.hrtime.bigint() - started));
  }
  return median(samples);
}

export function measureWholeEffort(base, iterations = 21) {
  const probes = buildEffortProbes(base);
  const cases = probes.map((probe) => {
    const maintained = recurringView(produceRecurringResult(probe.input));
    const direct = recurringView(directRecurringResult(probe.input));
    return {
      name: probe.name,
      match: JSON.stringify(maintained) === JSON.stringify(direct),
      maintained,
      direct,
    };
  });
  const maintainedMedianNs = timePath(produceRecurringResult, probes, iterations);
  const directMedianNs = timePath(directRecurringResult, probes, iterations);
  const ratio = directMedianNs === 0 ? null : maintainedMedianNs / directMedianNs;
  const operatingClass = classifyOperating(ratio);
  const maintainedIncrementalBytes = bytes(MAINTAINED);
  const directBytes = bytes(DIRECT);
  const sharedBytes = bytes(SHARED);
  const retainedBytes = bytes(RETAINED);
  const measurementBytes = bytes(MEASUREMENT);
  const buildClass = maintainedIncrementalBytes < directBytes
    ? "maintained_incremental_smaller"
    : maintainedIncrementalBytes === directBytes
      ? "build_equal"
      : "direct_build_smaller";
  const noChangeDecision = cases.some((item) => item.maintained.decisions?.some?.((decision) => (
    decision.outcome === OUTCOMES.usefulNoChange && decision.useful === true
  )));
  return {
    schema: EFFORT_SCHEMA,
    ok: cases.every((item) => item.match),
    parity: cases.every((item) => item.match),
    cases: cases.map((item) => ({ name: item.name, match: item.match, maintained: item.maintained })),
    noChangeDecisionValid: noChangeDecision,
    changeScore: null,
    build: {
      maintainedIncrementalBytes,
      directBytes,
      sharedAdmissionBytes: sharedBytes,
      retainedBytes,
      measurementBytes,
      maintainedWithAdmissionBytes: maintainedIncrementalBytes + sharedBytes,
      directWithAdmissionBytes: directBytes + sharedBytes,
      class: buildClass,
    },
    review: {
      maintainedNewSurfaceBytes: maintainedIncrementalBytes + sharedBytes,
      directSurfaceBytes: directBytes + sharedBytes,
      retainedSurfaceBytes: retainedBytes,
      measurementSurfaceBytes: measurementBytes,
      note: "Review the new caller plus the schedule gate. The direct baseline is reviewed as its own capture and decision implementation. Retained evaluator bytes were already reviewed and are not a new charge.",
    },
    operating: {
      iterations,
      probeCount: probes.length,
      maintainedMedianNs,
      directMedianNs,
      ratio,
      class: operatingClass.operating,
      noChange: operatingClass.noChange,
      diskExcluded: true,
      note: "In-process time for the same stored execution probes. Portable-state disk writes are not in the median.",
    },
    finding: {
      build: buildClass,
      operating: operatingClass.operating,
      noChange: operatingClass.noChange,
      noChangeDecisionValid: noChangeDecision,
    },
  };
}
