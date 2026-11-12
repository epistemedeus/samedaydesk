/**
 * Native control: the vendored Useful Commerce journey called directly on its own
 * synthetic fixtures, with no mapping layer and no workflow. This is the baseline
 * the Make, n8n and direct routes are compared against. Nothing here is changed
 * from Useful Commerce; it only calls the exported functions.
 */
import {
  createEffectProjection,
  periodNCapture,
  periodNPlus1Changed,
  periodNPlus1Preview,
  periodNPlus1SchemaChange,
  replayLaterPeriod,
  runRecordToAcceptedOutput,
  termsInputFromCaller,
  agentEntryCaller,
  workExchangeCaller,
} from "./vendor-paths.mjs";
import { SCENARIO_CLOCK } from "./fixtures.mjs";

function delivery(contract) {
  return {
    committed: true,
    requestDigest: contract.requestDigest,
    result: contract.acceptance?.expectedResult ?? contract.outcome?.expectedResult,
    evidence: [
      { name: "termsVersion", value: contract.request.body.termsVersion },
      { name: "captureId", value: contract.request.body.captureId },
      { name: "comparisonRecord", value: { expected: "accepted-output", observed: "accepted-output" } },
    ],
  };
}

export function runNativeControl() {
  const caller = workExchangeCaller();
  const entry = agentEntryCaller();
  const effects = createEffectProjection();
  const base = {
    clock: SCENARIO_CLOCK,
    correlationId: entry.correlationId,
    measurement: entry.measurement,
    tool: entry.tool,
    effectProjection: effects,
    delivery,
  };
  const periodN = runRecordToAcceptedOutput({ ...base, periodId: "period-N", taskId: caller.periodNTaskId, contextId: caller.contextId, termsInput: termsInputFromCaller(caller), ingestion: periodNCapture() });
  const lostReplyReplay = runRecordToAcceptedOutput({ ...base, periodId: "period-N", taskId: caller.periodNTaskId, contextId: caller.contextId, termsInput: termsInputFromCaller(caller), ingestion: periodNCapture() });
  const followUp = (ingestion) => ({
    periodId: "period-N+1",
    taskId: caller.periodNPlus1TaskId,
    contextId: caller.contextId,
    termsInput: termsInputFromCaller(caller, { preview: periodNPlus1Preview() }),
    ingestion,
    delivery,
    correlationId: entry.correlationId,
    measurement: entry.measurement,
    tool: entry.tool,
  });
  const changed = replayLaterPeriod({ periodN, followUp: followUp(periodNPlus1Changed()), clock: SCENARIO_CLOCK, effectProjection: effects });
  const schemaChange = replayLaterPeriod({ periodN, followUp: followUp(periodNPlus1SchemaChange()), clock: SCENARIO_CLOCK, effectProjection: effects });
  const steps = {
    periodN: { decision: periodN.period.decision, termsVersion: periodN.period.recordEvidence.termsVersion, exception: periodN.period.exception?.code ?? null },
    lostReplyReplay: { recovered: lostReplyReplay.period.retry.recovered, secondEffect: lostReplyReplay.period.retry.secondEffect, sameKey: lostReplyReplay.period.idempotencyKey === periodN.period.idempotencyKey },
    laterChanged: { outcome: changed.outcome, termsVersion: changed.periodNPlus1.period.recordEvidence.termsVersion, priorTermsVersion: changed.periodNAcceptedOutput.termsVersion },
    laterSchemaChange: {
      exception: schemaChange.reason,
      missingFields: schemaChange.missingFields,
      complete: schemaChange.period.completeness.complete,
      retryable: schemaChange.period.retry.retryable,
      adapted: false,
    },
  };
  const exceptions = [steps.laterSchemaChange.exception].filter(Boolean);
  return { route: "native", steps, exceptions, acceptedRecords: [periodN, changed.periodNPlus1].filter((r) => r.period.decision === "accept").length };
}
