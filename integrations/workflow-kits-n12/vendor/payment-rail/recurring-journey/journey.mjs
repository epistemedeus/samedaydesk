/**
 * Recurring record-to-accepted-output journey.
 * Reuses the job-contract runner and projects existing ingestion, results,
 * Work Exchange terms, and Agent Entry callers. Adds no store.
 */
import {
  createEffectProjection,
  evaluateAcceptance,
} from "../job-contract/acceptance.mjs";
import { buildJobContract, computeRequestDigest } from "../job-contract/job-contract.mjs";
import {
  projectAgentEntryPublicCaller,
  projectTaskIdentity,
  refuseAuthorizingCallerField,
} from "./caller-projection.mjs";
import {
  asCaptureFromEquivalent,
  comparePayloads,
  freshnessOf,
  projectIngestionRecord,
  projectN8nEquivalentEnvelope,
} from "./ingestion-projection.mjs";
import {
  DEFAULT_HORIZON_HOURS,
  JOURNEY_SCHEMA,
  PARENT_REFS,
} from "./pins.mjs";
import { assertTermsUnchanged, projectWorkExchangeCallerTerms } from "./terms-projection.mjs";

function failResult({ outcome, reason, message, extra = {} }) {
  return {
    schemaVersion: JOURNEY_SCHEMA,
    ok: false,
    useful: false,
    outcome,
    reason,
    message,
    acceptedOutput: null,
    artifact: null,
    ...extra,
  };
}

export function loadCallerTerms(input) {
  return projectWorkExchangeCallerTerms(input);
}

function runInner({
  periodId,
  taskId,
  contextId,
  followsTaskId = null,
  clock,
  horizonHours = DEFAULT_HORIZON_HOURS,
  termsInput,
  ingestion,
  delivery,
  correlationId = null,
  token = "<REDACTED>",
  measurement = null,
  continuationFileMissing = false,
  step = 0,
  tool = null,
  expectedResult,
  requiredEvidence,
  effectProjection = null,
  acquisitionPath = "installed",
  requiredFields = ["title", "status", "output"],
} = {}) {
  const callerGuard = refuseAuthorizingCallerField({
    taskId,
    correlationId,
    token,
    termsVersion: termsInput?.termsVersion,
  });
  if (!callerGuard.ok) return failResult(callerGuard);

  const publicCaller = projectAgentEntryPublicCaller({
    correlationId,
    token: token == null ? "<REDACTED>" : token,
    tool,
    step,
    measurement,
    continuationFileMissing,
  });
  if (!publicCaller.ok) return failResult(publicCaller);

  let termsProjection;
  try {
    termsProjection = projectWorkExchangeCallerTerms(termsInput);
  } catch (error) {
    return failResult({
      outcome: "exception",
      reason: "terms_invalid",
      message: error.message,
    });
  }
  if (termsProjection.ok === false || termsProjection.authorized === false) {
    return failResult({
      outcome: "exception",
      reason: termsProjection.reason,
      message: termsProjection.message,
      extra: {
        localTermsVersion: termsProjection.localTermsVersion,
        claimedTermsVersion: termsProjection.claimedTermsVersion ?? null,
      },
    });
  }

  const identity = projectTaskIdentity({
    taskId,
    contextId,
    followsTaskId,
    termsVersion: termsProjection.termsVersion,
  });
  if (!identity.ok) return failResult(identity);

  const ingested = projectIngestionRecord(ingestion);
  if (!ingested.ok) return failResult(ingested);

  const missingFields = requiredFields.filter(
    (field) => !Object.prototype.hasOwnProperty.call(ingested.payload, field),
  );
  if (missingFields.length > 0) {
    return failResult({
      outcome: "exception",
      reason: "schema_changed",
      message: `record is incomplete for the agreed fields: ${missingFields.join(", ")}`,
      extra: { missingFields, ingestionDigest: ingested.digest, captureId: ingested.captureId },
    });
  }

  const freshness = freshnessOf(ingested, clock, horizonHours);
  if (!freshness.ok) return failResult(freshness);

  const expected = expectedResult ?? ingested.payload;
  const evidence = requiredEvidence ?? [
    { name: "termsVersion", value: identity.termsVersion },
    { name: "captureId", value: ingested.captureId },
    { name: "comparisonRecord", value: { expected: "accepted-output", observed: "accepted-output" } },
  ];

  const target = ingested.sourceUri || "https://seller.example/synthetic-recurring-record";
  const request = {
    method: "POST",
    effect: "read_only",
    mediaType: "application/json",
    body: {
      synthetic: true,
      periodId,
      taskId: identity.taskId,
      contextId: identity.contextId,
      followsTaskId: identity.followsTaskId,
      termsVersion: identity.termsVersion,
      captureId: ingested.captureId,
      payload: ingested.payload,
    },
  };
  const requestDigest = computeRequestDigest({ request, target });
  const contract = buildJobContract({
    synthetic: true,
    task: {
      id: identity.taskId,
      terms: termsProjection.terms.summary,
      consumer: "Owner of one exact recurring record who must accept or reject a useful output and replay it in a later period.",
    },
    source: {
      repo: PARENT_REFS.workExchangePr463.repo,
      sha: PARENT_REFS.workExchangePr463.sha,
      ref: PARENT_REFS.workExchangePr463.branch,
      path: PARENT_REFS.workExchangePr463.fixturePath,
    },
    target,
    request,
    quote: {
      amountAtomic: "0",
      asset: "USDC",
      network: "eip155:8453",
      unsigned: true,
      boundRequestDigest: requestDigest,
      note: "Synthetic unsigned zero-amount quote for a free recurring acceptance check. Not a live payment or authorization.",
    },
    acceptance: {
      expectedResult: expected,
      requiredEvidence: evidence,
      immaterialInputPaths: [],
    },
  });

  const store = effectProjection ?? createEffectProjection();
  const artifact = evaluateAcceptance({
    contract,
    delivery: delivery && typeof delivery === "function"
      ? delivery(contract, { identity, ingested, termsProjection })
      : delivery,
    effectStore: store,
  });

  const accepted = artifact.decision === "accept";
  return {
    schemaVersion: JOURNEY_SCHEMA,
    ok: accepted,
    useful: accepted,
    outcome: accepted ? "accepted_output" : "rejected",
    reason: accepted ? "accepted" : (artifact.reasons?.[0] ?? "rejected"),
    message: accepted ? "period record produced an accepted output" : artifact.reasons.join("; "),
    periodId,
    acquisitionPath,
    identity,
    termsVersion: identity.termsVersion,
    ingestion: {
      captureId: ingested.captureId,
      digest: ingested.digest,
      capturedAt: ingested.capturedAt,
    },
    freshness: freshness.freshness,
    caller: publicCaller.publicView,
    measurement: publicCaller.measurement,
    contract,
    artifact,
    acceptedOutput: accepted
      ? {
          periodId,
          taskId: identity.taskId,
          contextId: identity.contextId,
          followsTaskId: identity.followsTaskId,
          termsVersion: identity.termsVersion,
          result: artifact.result,
          requestDigest: artifact.requestDigest,
          ingestionDigest: ingested.digest,
        }
      : null,
    effectProjection: store,
  };
}

export function replayLaterPeriod({
  periodN,
  followUp,
  clock,
  horizonHours = DEFAULT_HORIZON_HOURS,
  fields = ["title", "status", "output"],
  effectProjection = null,
} = {}) {
  if (!periodN?.acceptedOutput || periodN.artifact?.decision !== "accept") {
    return failResult({
      outcome: "exception",
      reason: "prior_not_accepted",
      message: "later-period replay requires a period N accepted output",
    });
  }
  if (followUp?.taskId && followUp.taskId === periodN.acceptedOutput.taskId) {
    return failResult({
      outcome: "exception",
      reason: "follow_up_not_new_task",
      message: "a follow-up must be a new task in the same context, not a mutation of the period N task id",
    });
  }
  if (followUp?.contextId && followUp.contextId !== periodN.acceptedOutput.contextId) {
    return failResult({
      outcome: "exception",
      reason: "context_mismatch",
      message: "a follow-up must stay in the same contextId",
    });
  }

  if (followUp?.sameTaskTerms) {
    const laterExchange = followUp.sameTaskTermsVersion
      ?? followUp.termsInput?.preview?.termsVersion
      ?? followUp.termsInput?.readAccepted?.termsVersion
      ?? null;
    const check = assertTermsUnchanged(
      periodN.acceptedOutput.termsVersion,
      laterExchange,
    );
    if (!check.ok) {
      return failResult({
        outcome: "exception",
        reason: "terms_changed",
        message: "sha256 termsVersion changed for the same task",
        extra: { expectedVersion: check.expectedVersion, actualVersion: check.actualVersion },
      });
    }
  }

  const later = runRecordToAcceptedOutput({
    periodId: followUp.periodId,
    taskId: followUp.taskId,
    contextId: followUp.contextId ?? periodN.acceptedOutput.contextId,
    followsTaskId: periodN.acceptedOutput.taskId,
    clock,
    horizonHours,
    termsInput: {
      ...followUp.termsInput,
      contextId: followUp.contextId ?? periodN.acceptedOutput.contextId,
      followsTaskId: periodN.acceptedOutput.taskId,
    },
    ingestion: followUp.ingestion,
    delivery: followUp.delivery,
    correlationId: followUp.correlationId ?? periodN.caller?.correlationId ?? null,
    token: followUp.token ?? "<REDACTED>",
    measurement: followUp.measurement ?? periodN.measurement ?? null,
    continuationFileMissing: followUp.continuationFileMissing === true,
    step: followUp.step ?? 1,
    tool: followUp.tool ?? null,
    expectedResult: followUp.expectedResult,
    requiredEvidence: followUp.requiredEvidence,
    effectProjection: effectProjection ?? followUp.effectProjection ?? createEffectProjection(),
    requiredFields: followUp.requiredFields ?? fields,
    acquisitionPath: followUp.acquisitionPath ?? periodN.acquisitionPath,
  });

  if (later.reason === "schema_changed") {
    return {
      ...failResult({
        outcome: "exception",
        reason: "schema_changed",
        message: later.message,
        extra: { missingFields: later.missingFields, periodNAcceptedOutput: periodN.acceptedOutput },
      }),
      periodNPlus1: later,
      contextId: periodN.acceptedOutput.contextId,
      period: later.period,
    };
  }


  const laterPayload = later.ok
    ? later.artifact.result
    : projectIngestionRecord(followUp.ingestion).ok
      ? projectIngestionRecord(followUp.ingestion).payload
      : null;
  const priorPayload = periodN.acceptedOutput.result;
  const comparison = laterPayload
    ? comparePayloads(priorPayload, laterPayload, fields)
    : { ok: false, outcome: later.outcome, reason: later.reason, message: later.message };

  return {
    schemaVersion: JOURNEY_SCHEMA,
    ok: comparison.ok === true,
    useful: comparison.outcome === "useful_change" || comparison.outcome === "useful_no_change",
    outcome: comparison.outcome ?? later.outcome,
    reason: comparison.reason ?? later.reason,
    message: comparison.ok
      ? `period N accepted output replayed at period N+1: ${comparison.outcome}`
      : later.message,
    periodNAcceptedOutput: periodN.acceptedOutput,
    periodNPlus1: later,
    comparison,
    contextId: periodN.acceptedOutput.contextId,
    caller: later.caller ?? periodN.caller,
  };
}

export function recoverLostReply(periodResult, delivery) {
  if (!periodResult?.contract || !periodResult?.effectProjection) {
    return failResult({
      outcome: "exception",
      reason: "nothing_to_recover",
      message: "recovery requires the original contract and effect projection",
    });
  }
  const artifact = evaluateAcceptance({
    contract: periodResult.contract,
    delivery,
    effectStore: periodResult.effectProjection,
  });
  return {
    schemaVersion: JOURNEY_SCHEMA,
    ok: artifact.committed === true && artifact.recovered === true && artifact.secondEffect === false,
    useful: artifact.decision === "accept",
    outcome: artifact.recovered ? "recovered_original" : artifact.decision,
    reason: artifact.reasons?.[0] ?? "recovered",
    message: artifact.reasons.join("; "),
    artifact,
    acceptedOutput: periodResult.acceptedOutput,
  };
}

/**
 * Compare an installed (direct/native) path with a hosted-equivalent stored envelope.
 * Reports whether useful results match, and counts amendments as integer field
 * and adapter steps, not percentages, margins, or assumed customers.
 * FlowAssert is not invoked here; if used later it is an external checker we consume.
 */
export function compareInstalledAndHosted({
  installedIngestion,
  hostedEnvelope,
  nodeName,
  captureId,
  subject,
  sourceUri,
  fields = ["title", "status", "output"],
} = {}) {
  const installed = projectIngestionRecord(installedIngestion);
  const hostedExtract = projectN8nEquivalentEnvelope(hostedEnvelope, nodeName);
  const hosted = hostedExtract.ok
    ? asCaptureFromEquivalent(hostedExtract, { captureId, subject, sourceUri })
    : hostedExtract;

  const installedAmendments = [
    "project permitted-capture schema",
    "bind the exchange-supplied termsVersion; local hash is a consistency check only",
    "run job-contract acceptance",
  ];
  const hostedAmendments = [
    "project permitted-capture schema",
    "bind the exchange-supplied termsVersion; local hash is a consistency check only",
    "run job-contract acceptance",
    "project hosted stored-execution envelope onto the same capture fields",
  ];

  if (!installed.ok || !hosted.ok) {
    return {
      ok: false,
      useful: false,
      outcome: !hosted.ok ? hosted.outcome : installed.outcome,
      reason: !hosted.ok ? hosted.reason : installed.reason,
      message: !hosted.ok ? hosted.message : installed.message,
      sameUsefulResult: false,
      installedAmendmentCount: installedAmendments.length,
      hostedAmendmentCount: hostedAmendments.length,
      extraHostedAmendments: hostedAmendments.slice(installedAmendments.length),
      installed,
      hosted,
    };
  }

  const comparison = comparePayloads(installed.payload, hosted.payload, fields);
  const sameUsefulResult = comparison.ok && comparison.outcome === "useful_no_change";
  return {
    ok: comparison.ok,
    useful: sameUsefulResult || comparison.outcome === "useful_change",
    outcome: sameUsefulResult ? "installed_and_hosted_agree" : comparison.outcome,
    reason: sameUsefulResult ? "same_useful_result" : comparison.reason ?? "payloads_differ",
    message: sameUsefulResult
      ? "installed and hosted-equivalent paths produced the same useful fields"
      : "installed and hosted-equivalent paths differed on compared fields",
    sameUsefulResult,
    comparison,
    installedAmendmentCount: installedAmendments.length,
    hostedAmendmentCount: hostedAmendments.length,
    extraHostedAmendments: hostedAmendments.slice(installedAmendments.length),
    installed,
    hosted,
  };
}

export { PARENT_REFS, createEffectProjection };

const RETRYABLE = new Set([
  "ingestion_missing",
  "capture_stale",
  "ingestion_incomplete",
  "uncommitted",
]);

/**
 * Stable per-period interface. Workflow Kits adapters read these field names.
 * The idempotency key is the job-contract request digest.
 */
export function periodInterface(result, { periodId = null } = {}) {
  const artifact = result.artifact ?? null;
  const uncommitted = artifact && artifact.committed === false;
  const code = result.ok ? null : (uncommitted ? "uncommitted" : result.reason);
  return {
    periodId: result.periodId ?? periodId,
    idempotencyKey: artifact?.requestDigest ?? result.contract?.requestDigest ?? null,
    recordEvidence: {
      taskId: result.identity?.taskId ?? null,
      contextId: result.identity?.contextId ?? null,
      followsTaskId: result.identity?.followsTaskId ?? null,
      termsVersion: result.termsVersion ?? null,
      captureId: result.ingestion?.captureId ?? result.captureId ?? null,
      ingestionDigest: result.ingestion?.digest ?? result.ingestionDigest ?? null,
      capturedAt: result.ingestion?.capturedAt ?? null,
      correlationId: result.caller?.correlationId ?? null,
    },
    completeness: {
      complete: result.reason !== "schema_changed" && result.reason !== "ingestion_incomplete",
      missingFields: result.missingFields ?? [],
    },
    exception: code ? { code, message: result.message } : null,
    retry: {
      retryable: code ? RETRYABLE.has(code) : false,
      sameIdempotencyKey: artifact?.requestDigest ?? null,
      recovered: artifact?.recovered === true,
      secondEffect: artifact?.secondEffect === true,
    },
    decision: artifact?.decision ?? null,
  };
}

export function runRecordToAcceptedOutput(input = {}) {
  const result = runInner(input);
  return { ...result, periodId: result.periodId ?? input.periodId, period: periodInterface(result, { periodId: input.periodId }) };
}

/**
 * Comparison columns. Native is filled from this module's tests.
 * Make and n8n are supplied by Workflow Kits Nov12; null means not yet supplied.
 */
export const COMPARISON_COLUMNS = Object.freeze(["steps", "failureHandling", "recovery", "duplicateEffects"]);

export const COMPARISON_ROWS = Object.freeze({
  native: Object.freeze({
    steps: "4: project permitted capture, bind the exchange-supplied termsVersion, build job contract, run acceptance",
    failureHandling: "typed exception per period: ingestion_missing, ingestion_not_permitted, capture_stale, schema_changed, terms_changed, token_used_as_task_ref, follow_up_not_new_task",
    recovery: "replay with the same idempotencyKey (request digest) returns the original committed result; uncommitted first request fabricates nothing",
    duplicateEffects: "0: secondEffect is false on replay",
  }),
  make: null,
  n8n: null,
});
