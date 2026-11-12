/**
 * Map a kit period input (from the Make or n8n adapter, or a native caller) onto the
 * vendored recurring journey and return its `period.*` interface unchanged.
 *
 * termsVersion authority: the kit never computes a termsVersion. It passes the
 * exchange-supplied value (Work Exchange preview or readAccepted, carried in
 * termsInput.preview / termsInput.readAccepted) through unchanged; the vendored journey
 * decides. A caller-side local hash sent as claimedTermsVersion that differs from the
 * exchange value is terms_changed.
 *
 * Agent Entry task-continuation 1.1.0: discovery is read only from the separate
 * measurement record (caller.measurement); any discovery inside a public view is
 * ignored. A missing continuation file (caller.continuationFileMissing) is the
 * non-retryable continuation_file_missing exception.
 *
 * The kit adds no ledger. The only state is the caller-owned effect projection
 * (keyed by the request digest), passed in by the client endpoint or the caller.
 */
import {
  createEffectProjection,
  periodInterface,
  refuseAuthorizingCallerField,
  replayLaterPeriod,
  runRecordToAcceptedOutput,
} from "./vendor-paths.mjs";
import { applyDeclaredSchemaAdapter } from "./schema-adapters.mjs";

export const PERIOD_INPUT_KIND = "samedaydesk.workflow-kits-n12.period-input.v1";
export const PERIOD_RESULT_KIND = "samedaydesk.workflow-kits-n12.period-result.v1";
export const PERIOD_FIELDS = Object.freeze([
  "periodId",
  "idempotencyKey",
  "recordEvidence",
  "completeness",
  "exception",
  "retry",
  "decision",
]);

/**
 * Effect projection with an applied-effect counter, so tests and the comparison can
 * count effects per idempotency key. It wraps the vendored projection unchanged.
 */
export function createKitEffects() {
  const inner = createEffectProjection();
  const applied = new Map();
  return {
    kind: "projection",
    get(key) {
      return inner.get(key);
    },
    remember(key, effect) {
      const outcome = inner.remember(key, effect);
      if (outcome.applied) applied.set(key, (applied.get(key) ?? 0) + 1);
      return outcome;
    },
    appliedCount(key) {
      if (key === undefined) {
        let total = 0;
        for (const count of applied.values()) total += count;
        return total;
      }
      return applied.get(key) ?? 0;
    },
    keys() {
      return [...applied.keys()];
    },
  };
}

function deliveryFor(input) {
  return (contract) => ({
    committed: input.committed === true,
    requestDigest: contract.requestDigest,
    result: input.workflowOutput ?? null,
    evidence: [
      { name: "termsVersion", value: contract.request.body.termsVersion },
      { name: "captureId", value: input.ingestion?.captureId ?? null },
      { name: "comparisonRecord", value: input.comparisonRecord ?? null },
    ],
  });
}

function refused(reason, message, periodId) {
  const result = {
    ok: false,
    useful: false,
    outcome: "exception",
    reason,
    message,
    acceptedOutput: null,
    artifact: null,
    periodId,
  };
  return result;
}

function finish(source, result, period, adapter) {
  return { kind: PERIOD_RESULT_KIND, source, period, adapter: adapter ?? null, result };
}

/**
 * Run one period. For a later period pass `periodN` (the journey result of the accepted
 * prior period); the follow-up must be a new task in the same contextId.
 */
export function runPeriod(input, { effects = createKitEffects(), periodN = null } = {}) {
  if (!input || input.kind !== PERIOD_INPUT_KIND) {
    throw new Error(`period input must have kind ${PERIOD_INPUT_KIND}`);
  }
  const source = input.source ?? "unknown";
  const caller = input.caller ?? {};

  const guard = refuseAuthorizingCallerField({
    taskId: input.taskId,
    taskRef: caller.taskRef,
    correlationId: caller.correlationId ?? null,
    token: caller.token ?? "<REDACTED>",
  });
  if (!guard.ok) {
    const result = refused(guard.reason, guard.message, input.periodId);
    return finish(source, result, periodInterface(result, { periodId: input.periodId }));
  }

  const adapted = applyDeclaredSchemaAdapter(input);
  if (!adapted.ok) {
    const result = refused(adapted.reason, adapted.message, input.periodId);
    return finish(source, result, periodInterface(result, { periodId: input.periodId }));
  }
  const effective = adapted.input;

  if (periodN) {
    const replay = replayLaterPeriod({
      periodN,
      clock: effective.clock,
      effectProjection: effects,
      followUp: {
        periodId: effective.periodId,
        taskId: effective.taskId,
        contextId: effective.contextId,
        termsInput: effective.termsInput,
        ingestion: effective.ingestion,
        delivery: deliveryFor(effective),
        correlationId: caller.correlationId ?? null,
        token: caller.token ?? "<REDACTED>",
        measurement: caller.measurement ?? null,
        continuationFileMissing: caller.continuationFileMissing === true,
        tool: caller.tool ?? null,
        step: caller.step ?? 1,
        sameTaskTerms: effective.sameTaskTerms,
        sameTaskTermsVersion: effective.sameTaskTermsVersion,
        expectedResult: effective.expectedResult,
        acquisitionPath: source === "native" ? "installed" : `hosted-${source}`,
      },
    });
    const period = replay.period
      ?? replay.periodNPlus1?.period
      ?? periodInterface({ ...replay, periodId: effective.periodId }, { periodId: effective.periodId });
    return finish(source, replay, period, adapted.adapter);
  }

  const result = runRecordToAcceptedOutput({
    periodId: effective.periodId,
    taskId: effective.taskId,
    contextId: effective.contextId,
    followsTaskId: effective.followsTaskId ?? null,
    clock: effective.clock,
    termsInput: effective.termsInput,
    ingestion: effective.ingestion,
    delivery: deliveryFor(effective),
    correlationId: caller.correlationId ?? null,
    token: caller.token ?? "<REDACTED>",
    measurement: caller.measurement ?? null,
    continuationFileMissing: caller.continuationFileMissing === true,
    tool: caller.tool ?? null,
    step: caller.step ?? 0,
    expectedResult: effective.expectedResult,
    effectProjection: effects,
    acquisitionPath: source === "native" ? "installed" : `hosted-${source}`,
  });
  return finish(source, result, result.period, adapted.adapter);
}

/** Pick exactly the stable period fields, for equality checks and HTTP replies. */
export function stablePeriod(period) {
  const picked = {};
  for (const field of PERIOD_FIELDS) picked[field] = period?.[field] ?? null;
  return picked;
}
