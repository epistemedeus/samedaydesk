import { runSourceChangeAlert } from "../../recurring-job-recipes/recipes/source-change-alert.mjs";
import { sha256Hex } from "../../recurring-job-recipes/lib/hash.mjs";
import { loadPrior } from "../../recurring-job-recipes/lib/prior.mjs";
import { maintenanceBrief, projectOccurrence } from "./brief.mjs";
import { quoteCaptures } from "./fee.mjs";
import { PINS } from "./pins.mjs";
import { finish } from "./result.mjs";
import { TEMPLATE } from "./template.mjs";
import { looksLikeFilesystemPath } from "../../result-reuse/src/omit.mjs";
import { blockingReasons, legacyEconomics, prepare } from "./validate.mjs";

export async function runMaintenanceOccurrence(request, deps = {}) {
  const prepared = prepare(request);
  if (!prepared.ok) return prepared.result;
  const value = prepared.value;
  if (value.priorAttempt) return readback(value, deps);
  return execute(value, deps);
}

async function readback(request, deps) {
  const fresh = await execute(request, deps);
  if (fresh.digest !== request.priorAttempt.digest) {
    return finish({
      ok: false,
      code: "ambiguous_conflict",
      message: "readback does not match the original occurrence; no second post",
      occurrenceId: request.occurrenceId,
      taskId: request.taskId,
      distinctTaskId: request.distinctTaskId,
      useful: true,
      usefulness: "useful_negative",
      executed: false,
      secondPost: false,
      posts: 1,
      acceptancePosts: 1,
      acceptance: "refused",
      defects: ["ambiguous_effect"],
    });
  }
  return {
    ...fresh,
    readback: true,
    executed: false,
    secondPost: false,
    posts: 1,
    acceptancePosts: 1,
  };
}

async function execute(request, deps) {
  const detect = deps.detect || runSourceChangeAlert;
  const loaded = loadPrior(request.priorPath);
  if (!loaded.ok) {
    return base(request, {
      ok: false,
      code: loaded.code,
      message: loaded.message,
      useful: true,
      usefulness: "useful_negative",
    });
  }
  if (loaded.prior.immutable !== true) {
    return base(request, { ok: false, code: "prior_not_immutable", message: "the prior stays immutable" });
  }
  if (loaded.prior.recipeId && loaded.prior.recipeId !== "source-change-alert") {
    return base(request, { ok: false, code: "prior_recipe_mismatch", message: "the prior is not a source-change baseline" });
  }
  if (loaded.prior.sha256 !== sha256Hex(loaded.prior.payload)) {
    return base(request, { ok: false, code: "prior_digest_mismatch", message: "the prior digest does not match its payload" });
  }
  if (request.sequence <= loaded.prior.sequence) {
    return base(request, { ok: false, code: "sequence_not_advanced", message: "the next observation must use a later sequence" });
  }

  let detected;
  try {
    detected = await detect({
      priorPath: request.priorPath,
      currentFixturePath: request.currentFixturePath,
      fields: request.fields,
      clock: request.clock,
      scheduleHint: request.schedule ?? null,
      horizonHours: request.horizonHours,
      replayPayment: request.replayPayment === true,
      liveSafe: false,
      retries: 0,
    });
  } catch {
    return base(request, {
      ok: false,
      code: "observe_error",
      message: "the compatibility observation stopped",
      useful: true,
      usefulness: "useful_negative",
      executed: true,
    });
  }

  const paymentCode = detected?.evidence?.code;
  if (paymentCode === "payment_replay_blocked" || paymentCode === "payment_authority_required") {
    return base(request, {
      ok: false,
      code: paymentCode,
      message: paymentCode === "payment_replay_blocked"
        ? "a prior payment receipt is not replayed"
        : "this occurrence does not purchase",
      useful: true,
      usefulness: "useful_negative",
      executed: true,
      defects: [paymentCode],
    });
  }

  if (!detected || detected.outcome === "error") {
    return classified(request, detected, {
      disposition: "refused",
      usefulness: "useful_negative",
      acceptance: "refused",
      code: detected?.evidence?.code ?? "observe_error",
      message: safeMessage(detected?.evidence?.message, "the compatibility observation stopped"),
    });
  }
  if (detected.outcome === "stale_baseline") {
    return classified(request, detected, {
      disposition: "stale_baseline",
      usefulness: "useful_negative",
      acceptance: "not_applicable",
      message: "the prior is older than the supplied horizon; no maintenance acceptance",
    });
  }
  if (detected.outcome === "unchanged") {
    return classified(request, detected, {
      disposition: "not_yet_due",
      usefulness: "not_due",
      acceptance: "not_applicable",
      message: request.claimHttp200Useful === true
        ? "HTTP 200 is not useful work; the contract is unchanged"
        : "the compatibility contract is unchanged",
      defects: request.claimHttp200Useful === true ? ["http_200_is_not_useful_work"] : [],
    });
  }
  if (detected.outcome !== "changed") {
    return classified(request, detected, {
      disposition: "refused",
      usefulness: "useful_negative",
      acceptance: "refused",
      code: "unclassified_observation",
      message: "the recipe outcome is not a compatibility change",
    });
  }

  const currentFields = Object.fromEntries(
    (detected.evidence?.changed ?? []).concat(detected.evidence?.unchanged ?? []).map((row) => [row.field, row.after ?? row.value ?? null]),
  );
  const reasons = blockingReasons(request.applicability, currentFields);
  const disposition = reasons.length > 0 ? "useful_no_fit" : "repair";
  const review = resolveReview(request);
  return classified(request, detected, {
    disposition,
    usefulness: disposition === "repair" ? "useful_positive" : "useful_negative",
    usefulnessClass: disposition === "repair" ? "useful_positive" : "useful_negative",
    acceptance: review.acceptance,
    acceptanceWinner: review.acceptanceWinner,
    expiryWinner: review.expiryWinner,
    code: review.code,
    defects: review.defects,
    blockingReasons: reasons,
    retainedSkuReused: retainedSku(detected),
    message: review.message,
    incident: review.incident,
    artifactRetained: true,
    localAcceptanceOnly: true,
  });
}

function resolveReview(request) {
  const review = request.review;
  const defects = [];
  let incident = null;
  if (review.presentedReceiptTaskId && review.presentedReceiptTaskId !== request.taskId) {
    return {
      acceptance: "refused",
      acceptanceWinner: false,
      expiryWinner: false,
      code: "receipt_reuse",
      defects: ["receipt_reuse"],
      incident: "receipt_reuse",
      message: "a receipt from another task cannot pay this occurrence",
    };
  }
  if (review.presentedReceiptOccurrenceId && review.presentedReceiptOccurrenceId !== request.occurrenceId) {
    return {
      acceptance: "refused",
      acceptanceWinner: false,
      expiryWinner: false,
      code: "receipt_reuse",
      defects: ["receipt_reuse"],
      incident: "receipt_reuse",
      message: "a receipt from another occurrence cannot pay this occurrence",
    };
  }
  const expired = request.expiry != null && Date.parse(request.clock) > Date.parse(request.expiry);
  if (expired) {
    return {
      acceptance: "expiry_winner",
      acceptanceWinner: false,
      expiryWinner: true,
      defects: ["expiry_winner"],
      incident: null,
      message: "expiry wins over a late review; the artifact is retained and not settled",
    };
  }
  if (review.presentedReceipt === true && (review.decision == null || !review.reviewer)) {
    defects.push("receipt_without_authorized_review");
    incident = "receipt_without_authorized_review";
  }
  if (review.operatorCapture === true && review.decision !== "accept") {
    defects.push("operator_capture_not_acceptance");
  }
  if (review.decision === "reject") {
    return {
      acceptance: "rejected",
      acceptanceWinner: false,
      expiryWinner: false,
      defects,
      incident,
      message: "the authorized reviewer rejected the occurrence",
    };
  }
  if (review.decision !== "accept" || !review.reviewer) {
    if (!review.reviewer) defects.push("missing_reviewer");
    return {
      acceptance: "approval_pending",
      acceptanceWinner: false,
      expiryWinner: false,
      defects,
      incident,
      message: review.operatorCapture === true
        ? "operator capture is not requester acceptance"
        : "acceptance waits for an authorized reviewer",
    };
  }
  return {
    acceptance: "accepted",
    acceptanceWinner: true,
    expiryWinner: false,
    defects,
    incident,
    message: "the authorized reviewer accepted the occurrence; capture is not joined",
  };
}

function classified(request, detected, decision) {
  const economics = economicsFor(request, decision.disposition);
  if (decision.acceptance !== "accepted" || economics.termsVersion !== "new-market" || decision.disposition !== "repair") {
    economics.purchaseOffered = false;
  }
  const quoteWrites = economics.applicable && economics.quoteOnly && decision.acceptance !== "refused" ? 1 : 0;
  const changed = (detected?.evidence?.changed ?? []).map((row) => ({
    field: row.field,
    before: row.before ?? null,
    after: row.after ?? null,
  }));
  const brief = maintenanceBrief({
    request,
    disposition: decision.disposition,
    detected,
  });
  const reuse = projectOccurrence(brief, request);
  const slots = fillSlots(decision, reuse, economics);
  return base(request, {
    ok: decision.acceptance !== "refused",
    code: decision.code ?? null,
    message: decision.message ?? null,
    useful: decision.usefulness !== "not_useful",
    usefulness: decision.usefulness,
    usefulnessClass: decision.usefulnessClass ?? null,
    executed: true,
    posts: 1,
    acceptancePosts: 1,
    quoteWrites,
    secondPost: false,
    detected: detected?.outcome ?? null,
    disposition: decision.disposition,
    acceptance: decision.acceptance,
    acceptanceWinner: decision.acceptanceWinner === true,
    expiryWinner: decision.expiryWinner === true,
    defects: decision.defects ?? [],
    incident: decision.incident ?? null,
    blockingReasons: decision.blockingReasons ?? [],
    retainedSkuReused: decision.retainedSkuReused === true,
    artifactRetained: decision.artifactRetained === true,
    localAcceptanceOnly: true,
    settled: false,
    change: changed,
    prior: {
      sequence: detected?.prior?.sequence ?? null,
      sha256: detected?.prior?.sha256 ?? null,
      createdAt: detected?.prior?.createdAt ?? null,
      immutable: true,
    },
    procurement: {
      mandateState: request.procurement.mandateState,
      mandateInherited: false,
      coldProfileDistinct: request.procurement.coldProfile !== request.procurement.incumbentProfile,
      priorSpend: request.procurement.priorSpend,
      reusableOutput: request.procurement.reusableOutput,
      repeatPurchase: null,
    },
    priorSpend: request.procurement.priorSpend,
    economics,
    reuse,
    slots,
    httpStatusIsNotUsefulWork: true,
    recovery: {
      status: "pending-join",
      signing: false,
      delegatedHandleCanSign: false,
    },
  });
}

function economicsFor(request, disposition) {
  const economics = request.economics;
  const unknowns = {
    lowestReliableReward: "unknown",
    tokenPriceRecommendation: null,
    declaredEffort: economics.declaredEffort === "declared" ? "declared" : "unknown",
    observedEffort: "unknown",
    observedCompleteEffort: "unknown",
    reviewBurden: "unknown",
    reviewBurdenIsMoney: false,
    modeledCost: "unknown",
    cashCost: "unknown",
    chainQualified: false,
  };
  if (disposition !== "repair" && disposition !== "useful_no_fit") {
    return {
      applicable: false,
      quoteOnly: false,
      termsVersion: economics.termsVersion,
      feeAtoms: "0",
      secondFeeAtoms: "0",
      operation: economics.operation,
      ...unknowns,
    };
  }
  if (economics.termsVersion === "221400" || economics.termsVersion === "234100") {
    return { ...legacyEconomics(economics.termsVersion, economics.legacyRewardsAtoms), ...unknowns };
  }
  if (economics.operation !== "quote") {
    return {
      applicable: true,
      quoteOnly: false,
      termsVersion: "new-market",
      operation: economics.operation,
      operationDistinct: true,
      feeAtoms: "0",
      secondFeeAtoms: "0",
      noSecondFee: true,
      authorization: "not_a_reservation",
      submission: "not_submitted",
      capture: "not_captured",
      ...unknowns,
    };
  }
  const quote = quoteCaptures(economics.captures);
  return {
    applicable: true,
    quoteOnly: true,
    termsVersion: "new-market",
    operation: "quote",
    authorization: "not_a_reservation",
    submission: "not_submitted",
    capture: "not_captured",
    purchaseOffered: disposition === "repair",
    ...quote,
    secondFeeAtoms: "0",
    ...unknowns,
  };
}

function fillSlots(decision, reuse, economics) {
  const maintenance = decision.disposition === "repair" || decision.disposition === "useful_no_fit";
  return {
    schema: TEMPLATE.schema,
    "compatibility-change": decision.disposition ? "filled" : "not-applicable",
    "repair-or-useful-no-fit": maintenance ? "filled" : "not-applicable",
    "accept-or-reject": decision.acceptance === "accepted" || decision.acceptance === "rejected" ? "filled" : decision.acceptance,
    "repeat-procurement": "filled",
    "cold-takeover": "filled",
    "task-economics": "filled",
    "result-reuse": reuse.previewOk ? "filled" : "unavailable",
    "legacy-terms": "filled",
    "h-join": "pending-join",
  };
}

function safeMessage(message, fallback) {
  if (typeof message !== "string" || message === "") return fallback;
  if (looksLikeFilesystemPath(message) || message.includes("/")) return fallback;
  return message;
}

function retainedSku(detected) {
  const rows = (detected.evidence?.changed ?? []).concat(detected.evidence?.unchanged ?? []);
  const sku = rows.find((row) => row.field === "sku");
  if (!sku) return false;
  const after = sku.after ?? sku.value ?? null;
  const before = sku.before ?? sku.value ?? null;
  return typeof after === "string" && after !== "" && after === before;
}

function base(request, partial) {
  return finish({
    occurrenceId: request.occurrenceId,
    taskId: request.taskId,
    distinctTaskId: request.distinctTaskId,
    consumed: {
      e01: PINS.consumed.e01.receiptHead,
      e02: PINS.consumed.e02.receiptHead,
      e06: PINS.consumed.e06.receiptHead,
    },
    ...partial,
  });
}
