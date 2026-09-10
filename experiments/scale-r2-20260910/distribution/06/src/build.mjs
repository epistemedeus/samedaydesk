import {
  ERROR_CODES,
  RECIPE_SCHEMA,
  RECIPE_STATUS,
  REQUIRED_REUSE_POLICY,
  USEFUL_JOB_KINDS,
} from "./constants.mjs";
import { recipeError, validateJob } from "./validate.mjs";

function defaultClock() {
  return Date.now();
}

/**
 * Build a bounded after-delivery continuation recipe from a job document.
 * Opt-in required; broadcast forbidden. Ties to concrete useful job kinds.
 * unavailable ≠ no_users for prior-delivery capture.
 */
export function buildContinuationRecipe(jobDoc, options = {}) {
  const clock = options.clock || defaultClock;

  let doc;
  try {
    doc = validateJob(jobDoc, { softMissing: true });
  } catch (err) {
    if (err.code === ERROR_CODES.MISSING_REQUIREMENT) {
      return {
        schema: RECIPE_SCHEMA,
        status: RECIPE_STATUS.BLOCKED_MISSING_INPUT,
        code: ERROR_CODES.BLOCKED_MISSING_INPUT,
        generatedAt: new Date(clock()).toISOString(),
        cite: typeof jobDoc?.cite === "string" ? jobDoc.cite : null,
        jobRef: jobDoc?.jobRef ?? null,
        afterDeliveryStep: null,
        reusePolicy: normalizePartialPolicy(jobDoc?.reusePolicy),
        commands: [],
        marketplaceHints: null,
        missingInputs: err.details?.missing || [err.message],
        privacyNotes: privacyNotes(),
        truthNotes: truthNotes(),
        mutationBoundary: mutationBoundary(),
        evidenceIndex: "evidence/INDEX.md",
        error: { code: err.code, message: err.message, details: err.details || null },
      };
    }
    throw err;
  }

  if (doc.captureStatus === "failed" || doc.captureStatus === "unavailable") {
    return {
      schema: RECIPE_SCHEMA,
      status: RECIPE_STATUS.UNAVAILABLE,
      code: ERROR_CODES.UNAVAILABLE,
      label: "prior_delivery_capture_failed_or_unavailable",
      generatedAt: new Date(clock()).toISOString(),
      cite: doc.cite,
      reason: doc.reason || "prior delivery context capture unavailable",
      jobRef: doc.jobRef,
      afterDeliveryStep: null,
      reusePolicy: { ...REQUIRED_REUSE_POLICY },
      commands: [],
      marketplaceHints: null,
      missingInputs: [],
      privacyNotes: privacyNotes(),
      truthNotes: [
        "Prior delivery capture failed or unavailable — do not claim zero deliveries/users.",
        "unavailable ≠ no_users.",
        "Opt-in still required; no unsolicited broadcast.",
      ],
      mutationBoundary: mutationBoundary(),
      evidenceIndex: "evidence/INDEX.md",
      // Explicitly omit priorDeliveryCount
    };
  }

  const priorDeliveryCount =
    typeof doc.priorDeliveryCount === "number" && Number.isFinite(doc.priorDeliveryCount)
      ? doc.priorDeliveryCount
      : countPriorDeliveries(doc);

  if (priorDeliveryCount === 0) {
    return {
      schema: RECIPE_SCHEMA,
      status: RECIPE_STATUS.NO_USERS,
      code: ERROR_CODES.NO_USERS,
      label: "capture_succeeded_zero_prior_deliveries",
      generatedAt: new Date(clock()).toISOString(),
      cite: doc.cite,
      reason: doc.reason || "capture succeeded; prior delivery count is zero",
      jobRef: doc.jobRef,
      afterDeliveryStep: null,
      reusePolicy: { ...REQUIRED_REUSE_POLICY },
      commands: [],
      marketplaceHints: marketplaceHintsFrom(doc),
      priorDeliveryCount: 0,
      missingInputs: [],
      privacyNotes: privacyNotes(),
      truthNotes: [
        "Capture succeeded with zero prior deliveries (no_users).",
        "This is distinct from unavailable (capture failed).",
        "Do not invent deliveries, buyers, or revenue.",
      ],
      mutationBoundary: mutationBoundary(),
      evidenceIndex: "evidence/INDEX.md",
    };
  }

  const afterDeliveryStep = resolveAfterDeliveryStep(doc);
  const commands = resolveCommands(doc);
  const marketplaceHints = marketplaceHintsFrom(doc);

  return {
    schema: RECIPE_SCHEMA,
    status: RECIPE_STATUS.AVAILABLE,
    label: "continuation_recipe_ready_opt_in_reuse",
    generatedAt: new Date(clock()).toISOString(),
    cite: doc.cite,
    jobRef: {
      kind: doc.jobRef.kind,
      evidencePath: doc.jobRef.evidencePath || null,
      sourcePath: doc.jobRef.sourcePath || null,
      productSlug: doc.jobRef.productSlug || defaultSlug(doc.jobRef.kind),
      note: doc.jobRef.note || null,
    },
    afterDeliveryStep,
    reusePolicy: { ...REQUIRED_REUSE_POLICY },
    commands,
    marketplaceHints,
    priorDeliveryCount,
    missingInputs: [],
    privacyNotes: privacyNotes(),
    truthNotes: truthNotes(),
    mutationBoundary: mutationBoundary(),
    evidenceIndex: "evidence/INDEX.md",
    reuseGate: {
      requiresExplicitOptIn: true,
      allowsUnsolicitedBroadcast: false,
      note: "Consumer must opt in before any reuse command runs; no fan-out fields emitted.",
    },
  };
}

export function assertCaptureDistinct(unavailableRecipe, noUsersRecipe) {
  if (!unavailableRecipe || unavailableRecipe.status !== RECIPE_STATUS.UNAVAILABLE) {
    throw recipeError(ERROR_CODES.INVALID_INPUT, "expected unavailable status");
  }
  if (Object.prototype.hasOwnProperty.call(unavailableRecipe, "priorDeliveryCount")) {
    throw recipeError(
      ERROR_CODES.INVALID_INPUT,
      "unavailable must not report priorDeliveryCount (would collapse into no_users)",
    );
  }
  if (!noUsersRecipe || noUsersRecipe.status !== RECIPE_STATUS.NO_USERS) {
    throw recipeError(ERROR_CODES.INVALID_INPUT, "expected no_users status");
  }
  if (unavailableRecipe.status === noUsersRecipe.status) {
    throw recipeError(ERROR_CODES.INVALID_INPUT, "capture statuses collapsed");
  }
  if (unavailableRecipe.code === noUsersRecipe.code) {
    throw recipeError(ERROR_CODES.INVALID_INPUT, "capture codes collapsed");
  }
  return true;
}

export function assertOptInNoBroadcast(recipe) {
  if (!recipe?.reusePolicy) {
    throw recipeError(ERROR_CODES.FORBIDDEN_OPT_IN, "reusePolicy missing");
  }
  if (recipe.reusePolicy.optInRequired !== true) {
    throw recipeError(ERROR_CODES.FORBIDDEN_OPT_IN, "optInRequired must be true");
  }
  if (recipe.reusePolicy.broadcast !== false) {
    throw recipeError(ERROR_CODES.FORBIDDEN_BROADCAST, "broadcast must be false");
  }
  return true;
}

function normalizePartialPolicy(policy) {
  if (!policy || typeof policy !== "object") {
    return { optInRequired: null, broadcast: null };
  }
  return {
    optInRequired: policy.optInRequired === true ? true : policy.optInRequired ?? null,
    broadcast: policy.broadcast === false ? false : policy.broadcast ?? null,
  };
}

function countPriorDeliveries(doc) {
  if (Array.isArray(doc.priorDeliveries)) return doc.priorDeliveries.length;
  if (doc.deliveryObserved === true) return 1;
  return 0;
}

function defaultSlug(kind) {
  if (kind === USEFUL_JOB_KINDS.SOURCE_CHANGE_EVIDENCE_PACK) {
    return "samedaydesk-source-change-evidence";
  }
  if (kind === USEFUL_JOB_KINDS.AGENSI_PROVENANCE_COMPARE) {
    return "offline-package-provenance-check";
  }
  return null;
}

function resolveAfterDeliveryStep(doc) {
  if (typeof doc.afterDeliveryStep === "string" && doc.afterDeliveryStep.trim()) {
    return doc.afterDeliveryStep.trim();
  }
  if (doc.jobRef.kind === USEFUL_JOB_KINDS.SOURCE_CHANGE_EVIDENCE_PACK) {
    return (
      "After a source-change evidence pack delivery: optionally re-run the same " +
      "bounded pack_evidence command on a new supplied diff (consumer opt-in only). " +
      "Do not fan-out, broadcast, or auto-notify."
    );
  }
  if (doc.jobRef.kind === USEFUL_JOB_KINDS.AGENSI_PROVENANCE_COMPARE) {
    return (
      "After an offline package provenance compare delivery: optionally re-check " +
      "license/provenance on a new archive (consumer opt-in only). No unsolicited broadcast."
    );
  }
  return "After delivery: optional opt-in reuse of the same bounded useful job; no broadcast.";
}

function resolveCommands(doc) {
  if (Array.isArray(doc.commands) && doc.commands.length > 0) {
    return doc.commands.map((c) => ({
      command: c.command,
      optInRequired: true,
      broadcast: false,
      note: c.note || "opt-in reuse only — not an unsolicited send",
      evidenceRef: c.evidenceRef || null,
    }));
  }
  if (doc.jobRef.kind === USEFUL_JOB_KINDS.SOURCE_CHANGE_EVIDENCE_PACK) {
    return [
      {
        command:
          "node agent/pack_evidence.js --unifiedDiffFile fixtures/diff/simple.patch --buyerCriteriaFile fixtures/criteria/require-structural.json --stdout-only",
        optInRequired: true,
        broadcast: false,
        note: "Quoted from Grexal S124 package README; opt-in re-run after delivery; not a broadcast",
        evidenceRef:
          doc.jobRef.sourcePath ||
          "/workspace/pilot/tmp/s124-root-0910.dYRsYW/grexal/package/README.md",
      },
      {
        command: "npm test",
        optInRequired: true,
        broadcast: false,
        note: "Local package tests; opt-in only; no provider mutation",
        evidenceRef: doc.jobRef.sourcePath || null,
      },
    ];
  }
  if (doc.jobRef.kind === USEFUL_JOB_KINDS.AGENSI_PROVENANCE_COMPARE) {
    return [
      {
        command: "unzip -l dist/offline-package-provenance.zip",
        optInRequired: true,
        broadcast: false,
        note: "Local ZIP inspect; opt-in only; no Agensi login/review-submit",
        evidenceRef: doc.jobRef.sourcePath || null,
      },
    ];
  }
  return [];
}

function marketplaceHintsFrom(doc) {
  const hints = doc.marketplaceHints && typeof doc.marketplaceHints === "object"
    ? { ...doc.marketplaceHints }
    : {};
  // Default S149 Grexal surface for source-change evidence pack useful job
  if (doc.jobRef?.kind === USEFUL_JOB_KINDS.SOURCE_CHANGE_EVIDENCE_PACK) {
    return {
      surface: "grexal",
      listingStatus: hints.listingStatus || "PUBLIC_ACTIVE",
      agentId: hints.agentId || "j970cajvv6wbrmy64s2f4ajzw18e5j2q",
      deploymentVersion: hints.deploymentVersion || "v1",
      pricingRunCompletedUsd:
        typeof hints.pricingRunCompletedUsd === "number"
          ? hints.pricingRunCompletedUsd
          : 0.02,
      estimateReserveUsd:
        typeof hints.estimateReserveUsd === "number" ? hints.estimateReserveUsd : 0.025,
      estimateReserveIsCharge: false,
      customerExecutionRevenuePayout: false,
      receiptRef:
        hints.receiptRef ||
        "/workspace/pilot/receipts/scale-bot-0909/r2-team/receipts-grexal-s149.json",
      note:
        hints.note ||
        "S149 marketplace surface for the useful job — list pricing ≠ earnings; no customer revenue claimed",
    };
  }
  if (Object.keys(hints).length === 0) return null;
  return {
    ...hints,
    customerExecutionRevenuePayout: false,
  };
}

function privacyNotes() {
  return [
    "Continuation recipe is opt-in only; broadcast=false always.",
    "No unsolicited fan-out fields (broadcastAudience, blastList, etc.).",
    "jobRef cites a concrete useful job with evidence/source path — not a generic alert.",
    "unavailable omits priorDeliveryCount; no_users sets it to 0.",
    "Marketplace hints cite S149 PUBLIC_ACTIVE listing; pricing ≠ revenue/payout.",
  ];
}

function truthNotes() {
  return [
    "DEMO ties to Grexal PUBLIC ACTIVE S149 (agentId j970cajvv6wbrmy64s2f4ajzw18e5j2q, run_completed 0.02 USD) as marketplace surface for source_change_evidence_pack — no customer revenue claimed.",
    "Useful job: samedaydesk-source-change-evidence (S124 package) after-delivery continuation.",
    "Agensi provenance compare is an alternate useful job kind; Agensi remains Free PendingReview 0 installs.",
    "unavailable ≠ no_users; opt-in required; no unsolicited broadcast.",
  ];
}

function mutationBoundary() {
  return {
    executesProviderMutations: false,
    forbids: [
      "grexal login",
      "agensi Bot login",
      "price / publish / review-submit",
      "unsolicited broadcast / fan-out",
      "optInRequired:false",
      "broadcast:true",
      "generic version_alert job kind",
      "invent buyers or revenue",
      "collapse unavailable into no_users",
    ],
    ownerOfPublicationAndPrice: "Root",
    ownerOfPendingReviewOutcome: "Root",
    reuseRequiresOptIn: true,
  };
}
