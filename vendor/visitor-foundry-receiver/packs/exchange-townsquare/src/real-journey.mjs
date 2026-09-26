/**
 * Real supplied-data journey. Separate from the fixture demo composer.
 * Reuses Exchange 01–08 engines. Never loads demo fixtures or synthesizes acceptance.
 */
import {
  ACCEPTANCE_KIND,
  JOURNEY_OUTCOME,
  buildJourneyReceipt,
  fingerprintInput,
  isReceiptStructurallyValid,
  preflightExchangePackageSync,
  receiptMatchesJourney,
  runRequesterDeliveryJourney,
} from "../exchange/08/src/index.mjs";
import {
  adaptSuppliedInput,
  attachExplicitRequesterAccept,
  sha256Json,
} from "../adapter/supplied-input.mjs";
import {
  COMPLETION_LABEL,
  FORBIDDEN_COMPLETION_LABEL,
  PACKAGE_ID,
  PROVENANCE,
  S166_INTAKE_CONTRACT_REF,
  SUPPLIED_JOURNEY_SCHEMA,
  SUPPLIED_REASON,
} from "./labels.mjs";

export {
  ACCEPTANCE_KIND,
  JOURNEY_OUTCOME,
  COMPLETION_LABEL,
  FORBIDDEN_COMPLETION_LABEL,
  PACKAGE_ID,
  PROVENANCE,
  S166_INTAKE_CONTRACT_REF,
  SUPPLIED_JOURNEY_SCHEMA,
  SUPPLIED_REASON,
  adaptSuppliedInput,
  attachExplicitRequesterAccept,
  sha256Json,
};

const LOCAL_NOTE =
  "Caller-supplied local run. Local gate pass is local_run_ok — not external completion, customer adoption, or actual_completion. No escrow, token, payment backend, or hosted board API.";

function stoppedResult({ reason, stages, acquisition = null, extra = {} }) {
  return {
    schema: SUPPLIED_JOURNEY_SCHEMA,
    packageId: PACKAGE_ID,
    ok: false,
    gated: true,
    localRunOk: false,
    actualCompletion: false,
    provenance: PROVENANCE.SUPPLIED_LOCAL,
    completionLabel: COMPLETION_LABEL.SUPPLIED_LOCAL,
    outcome: JOURNEY_OUTCOME.STOPPED,
    outcomeReason: reason,
    acceptanceKind: ACCEPTANCE_KIND.NONE,
    selectedProposalId: extra.selectedProposalId ?? extra.exchangeInput?.chosenProposalId ?? null,
    s166IntakeContractRef: S166_INTAKE_CONTRACT_REF,
    stages,
    acquisition,
    declaredSourceIdentity: extra.declaredSourceIdentity ?? extra.exchangeInput?.declaredSourceIdentity ?? null,
    checks: extra.checks ?? null,
    correction: extra.correction ?? null,
    admission: extra.admission ?? null,
    gate: extra.gate ?? { decision: "stop", reason },
    receipt: null,
    replay: { matched: false, structurallyValid: false },
    note: LOCAL_NOTE,
    ...extra,
  };
}

/**
 * Run a caller-supplied task through Exchange 01–08.
 * clock defaults to Date.now(); inject a valid time for tests. Fixture time is demo-only.
 */
export function runSuppliedExchangeJourney(rawInput, { clock = () => Date.now() } = {}) {
  const stages = [];

  const acquisition = preflightExchangePackageSync();
  stages.push({
    stage: "exchange_preflight",
    ok: acquisition.ok === true,
    decision: acquisition.decision,
    reason: acquisition.reason,
  });
  if (!acquisition.ok) {
    return stoppedResult({
      reason: acquisition.reason,
      stages,
      acquisition,
      extra: { note: "Exchange package preflight failed — stop before supplied work." },
    });
  }

  let adapted;
  try {
    adapted = adaptSuppliedInput(rawInput, { clock });
  } catch (err) {
    stages.push({
      stage: "source_link",
      ok: false,
      reason: err.code || SUPPLIED_REASON.INVALID_INPUT,
      message: err.message,
    });
    return stoppedResult({
      reason: err.code || SUPPLIED_REASON.INVALID_INPUT,
      stages,
      acquisition,
      extra: { error: err.message, errorCode: err.code || null },
    });
  }

  stages.push({
    stage: "source_link",
    ok: adapted.ok === true,
    adapter: adapted.adapter || null,
    reason: adapted.reason || null,
    honestLimit: adapted.honestLimit || null,
  });
  if (!adapted.ok) {
    return stoppedResult({
      reason: adapted.reason,
      stages,
      acquisition,
      extra: {
        detail: adapted.detail || null,
        expected: adapted.expected,
        provided: adapted.provided,
        adapter: adapted.adapter || null,
        honestLimit: adapted.honestLimit || null,
      },
    });
  }

  const exchangeInput = adapted.exchangeInput;
  let exchange;
  try {
    exchange = runRequesterDeliveryJourney(exchangeInput, { clock });
  } catch (err) {
    stages.push({
      stage: "exchange_delivery",
      ok: false,
      reason: err.code || SUPPLIED_REASON.INVALID_INPUT,
      message: err.message,
    });
    return stoppedResult({
      reason: err.code || SUPPLIED_REASON.INVALID_INPUT,
      stages,
      acquisition,
      extra: {
        error: err.message,
        errorCode: err.code || null,
        townsquare: exchangeInput.townsquare,
        exchangeInputFingerprintSha256: fingerprintInput(exchangeInput),
      },
    });
  }

  const outcomeReason = exchange.outcomeReason ?? exchange.gate?.reason ?? null;
  const acceptanceKind = exchange.acceptanceKind ?? null;
  const selectedProposalId = exchange.selectedProposalId ?? null;

  stages.push({
    stage: "exchange_delivery",
    ok: exchange.ok === true,
    outcome: exchange.outcome,
    outcomeReason,
    acceptanceKind,
    gated: exchange.gated === true,
    lifecycleStatus: exchange.lifecycle?.status ?? null,
  });

  const receipt = buildJourneyReceipt(exchangeInput, exchange, { clock });
  const replay = runRequesterDeliveryJourney(exchangeInput, { clock });
  const replayMatch = receiptMatchesJourney(receipt, replay, exchangeInput);

  const localRunOk =
    exchange.ok === true &&
    exchange.outcome === JOURNEY_OUTCOME.ACCEPTED &&
    exchange.lifecycle?.status === "completed" &&
    replayMatch === true;

  const completionLabel = localRunOk ? COMPLETION_LABEL.LOCAL_RUN_OK : COMPLETION_LABEL.SUPPLIED_LOCAL;

  const exchangeView = {
    ok: exchange.ok,
    outcome: exchange.outcome,
    outcomeReason,
    acceptanceKind,
    taskId: exchange.taskId,
    selectedProposalId,
    proposalId: exchange.proposalId ?? null,
    boundArtifactSha256: exchange.boundArtifactSha256 ?? null,
    boundRevisionSha256: exchange.boundRevisionSha256 ?? null,
    lifecycle: exchange.lifecycle,
    gated: exchange.gated === true,
    agreement: exchange.agreement ?? null,
    gate: exchange.gate ?? null,
    correction: exchange.correction ?? null,
    admission: exchange.admission ?? null,
    checks: exchange.checks ?? null,
  };

  return {
    schema: SUPPLIED_JOURNEY_SCHEMA,
    packageId: PACKAGE_ID,
    ok: exchange.ok === true,
    gated: exchange.gated === true,
    outcome: exchange.outcome,
    outcomeReason,
    acceptanceKind,
    selectedProposalId,
    provenance: PROVENANCE.SUPPLIED_LOCAL,
    completionLabel,
    localRunOk,
    actualCompletion: false,
    s166IntakeContractRef: S166_INTAKE_CONTRACT_REF,
    stages,
    townsquare: exchangeInput.townsquare,
    declaredSourceIdentity: exchangeInput.declaredSourceIdentity ?? null,
    exchange: exchangeView,
    checks: exchangeView.checks,
    correction: exchangeView.correction,
    admission: exchangeView.admission,
    gate: exchangeView.gate,
    receipt,
    replay: {
      matched: replayMatch,
      structurallyValid: isReceiptStructurallyValid(receipt),
      inputFingerprintSha256: fingerprintInput(exchangeInput),
    },
    exchangeInput,
    exchangeInputFingerprintSha256: fingerprintInput(exchangeInput),
    note: LOCAL_NOTE,
  };
}

/** Verify a saved receipt against a supplied replay input. */
export function verifySuppliedReceipt(receipt, exchangeInput, { clock = () => Date.now() } = {}) {
  const structural = isReceiptStructurallyValid(receipt);
  if (exchangeInput == null) {
    return {
      structurallyValid: structural,
      replayMatched: false,
      reason: "replay_input_required",
    };
  }
  const replay = runRequesterDeliveryJourney(exchangeInput, { clock });
  return {
    structurallyValid: structural,
    replayMatched: receiptMatchesJourney(receipt, replay, exchangeInput),
    replayOutcome: replay.outcome,
    replayOk: replay.ok === true,
  };
}
