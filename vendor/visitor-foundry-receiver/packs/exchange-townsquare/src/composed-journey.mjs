/**
 * DEMO composed lab journey: TownSquare synthetic thread → Exchange delivery → receipt/replay.
 * Fixture-isolated. Real supplied data uses src/real-journey.mjs.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

import { runConversationToTask } from "../townsquare/kit/src/pipeline.mjs";
import { runFirstUse } from "../townsquare/first-run/first-run.mjs";
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
  adaptTownsquareToExchangeInput,
  loadPartialArtifact,
  loadPositiveArtifact,
  sha256Json,
  withBoundAccept,
} from "../adapter/townsquare-to-exchange.mjs";
import {
  COMPLETION_LABEL,
  COMPOSED_SCHEMA,
  DEMO_CLOCK_ISO,
  DEMO_CLOCK_MS,
  FORBIDDEN_COMPLETION_LABEL,
  PACKAGE_ID,
  PROVENANCE,
  S166_INTAKE_CONTRACT_REF,
  demoClock,
} from "./labels.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_CONVERSATION = join(
  __dirname,
  "../townsquare/kit/fixtures/conversation.positive.json",
);

export {
  ACCEPTANCE_KIND,
  JOURNEY_OUTCOME,
  COMPLETION_LABEL,
  COMPOSED_SCHEMA,
  DEMO_CLOCK_ISO,
  DEMO_CLOCK_MS,
  FORBIDDEN_COMPLETION_LABEL,
  PACKAGE_ID,
  PROVENANCE,
  S166_INTAKE_CONTRACT_REF,
  buildJourneyReceipt,
  demoClock,
  fingerprintInput,
  isReceiptStructurallyValid,
  receiptMatchesJourney,
  preflightExchangePackageSync,
};

function loadJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

/**
 * Cold-start DEMO journey. Always provenance fixture_demo.
 * Local gate pass does not become actual_completion.
 *
 * modes:
 *  - happy: townsquare → fixture overlay + synthesized bound accept
 *  - objective_auto: clear fixture subjective; automatic objective evidence
 *  - correction: fixture partial → correct → bound accept
 *  - reject: explicit reject terminal
 *  - gate: unsafe/foreign stop (caller may pass fileSetContract)
 */
export function runComposedLabJourney(options = {}) {
  const {
    mode = "happy",
    conversationPath = DEFAULT_CONVERSATION,
    conversation = null,
    clock = demoClock,
    exchangeOverrides = {},
    useFirstRunHelper = false,
  } = options;

  const provenance = PROVENANCE.FIXTURE_DEMO;
  const stages = [];

  const acquisition = preflightExchangePackageSync();
  stages.push({
    stage: "exchange_preflight",
    ok: acquisition.ok === true,
    decision: acquisition.decision,
    reason: acquisition.reason,
  });
  if (!acquisition.ok) {
    return {
      schema: COMPOSED_SCHEMA,
      packageId: PACKAGE_ID,
      ok: false,
      gated: true,
      outcome: JOURNEY_OUTCOME.STOPPED,
      provenance,
      completionLabel: COMPLETION_LABEL.FIXTURE_DEMO,
      localRunOk: false,
      actualCompletion: false,
      stages,
      acquisition,
      note: "Exchange package preflight failed — stop before townsquare/exchange work.",
    };
  }

  let townsquare;
  if (useFirstRunHelper) {
    townsquare = runFirstUse(conversationPath);
    stages.push({
      stage: "townsquare_first_run",
      ok: true,
      scopedTaskId: townsquare.scopedTaskId,
      packageId: townsquare.packageId,
    });
  } else {
    const input = conversation || loadJson(conversationPath);
    if (input.demo !== true) {
      const err = new Error("demo composed journey requires conversation.demo:true");
      err.code = "synthetic_only";
      throw err;
    }
    townsquare = runConversationToTask(input, { now: new Date(clock()).toISOString() });
    stages.push({
      stage: "townsquare_conversation_to_task",
      ok: true,
      scopedTaskId: townsquare.task?.id,
      packageId: townsquare.packageId,
      modulesIntegrated: townsquare.modulesIntegrated,
    });
  }

  const clearSubjective = mode === "objective_auto" || mode === "reject";
  let exchangeInput = adaptTownsquareToExchangeInput(townsquare, {
    clearSubjective,
    ...exchangeOverrides,
  });

  if (mode === "correction") {
    const partial = loadPartialArtifact();
    const fixed = loadPositiveArtifact();
    exchangeInput = adaptTownsquareToExchangeInput(townsquare, {
      clearSubjective: false,
      artifact: partial,
      correctedArtifact: fixed,
      ...exchangeOverrides,
    });
    const probe = runRequesterDeliveryJourney(
      { ...exchangeInput, requesterDecision: undefined },
      { clock },
    );
    exchangeInput = withBoundAccept(exchangeInput, probe);
  } else if (mode === "reject") {
    exchangeInput = {
      ...exchangeInput,
      requesterDecision: {
        decision: "reject",
        artifactSha256: sha256Json(exchangeInput.artifact),
      },
    };
  } else if (mode === "objective_auto") {
    exchangeInput = { ...exchangeInput, requesterDecision: undefined };
  } else if (mode === "happy") {
    const probe = runRequesterDeliveryJourney(
      { ...exchangeInput, requesterDecision: undefined },
      { clock },
    );
    exchangeInput = withBoundAccept(exchangeInput, probe);
  } else if (mode === "gate") {
    // Leave as adapted; caller should supply foreign fileSetContract via overrides.
  }

  const exchange = runRequesterDeliveryJourney(exchangeInput, { clock });
  stages.push({
    stage: "exchange_delivery",
    ok: exchange.ok === true,
    outcome: exchange.outcome,
    outcomeReason: exchange.outcomeReason,
    acceptanceKind: exchange.acceptanceKind ?? null,
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

  return {
    schema: COMPOSED_SCHEMA,
    packageId: PACKAGE_ID,
    ok: exchange.ok === true,
    gated: exchange.gated === true,
    outcome: exchange.outcome,
    outcomeReason: exchange.outcomeReason,
    acceptanceKind: exchange.acceptanceKind ?? null,
    provenance,
    completionLabel: COMPLETION_LABEL.FIXTURE_DEMO,
    localRunOk,
    actualCompletion: false,
    s166IntakeContractRef: S166_INTAKE_CONTRACT_REF,
    stages,
    townsquare: {
      scopedTaskId: townsquare.task?.id || townsquare.scopedTaskId || null,
      packageId: townsquare.packageId || townsquare.schema || null,
      demo: townsquare.demo === true,
      contradictionPreserved:
        townsquare.task?.contradictionPreserved ??
        townsquare.correctedAnswer?.contradictionPreserved ??
        null,
    },
    exchange: {
      ok: exchange.ok,
      outcome: exchange.outcome,
      outcomeReason: exchange.outcomeReason,
      acceptanceKind: exchange.acceptanceKind ?? null,
      taskId: exchange.taskId,
      proposalId: exchange.proposalId,
      boundArtifactSha256: exchange.boundArtifactSha256,
      boundRevisionSha256: exchange.boundRevisionSha256,
      lifecycle: exchange.lifecycle,
      gated: exchange.gated,
      agreement: exchange.agreement ?? null,
    },
    receipt,
    replay: {
      matched: replayMatch,
      structurallyValid: isReceiptStructurallyValid(receipt),
      inputFingerprintSha256: fingerprintInput(exchangeInput),
    },
    exchangeInputFingerprintSha256: fingerprintInput(exchangeInput),
    note: "Fixture demo only. Local gate pass stays fixture_demo — not actual_completion, external completion, or customer adoption.",
  };
}

/** Verify a saved receipt against a supplied replay input (API + CLI regression helper). */
export function verifyComposedReceipt(receipt, exchangeInput, { clock = demoClock } = {}) {
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
