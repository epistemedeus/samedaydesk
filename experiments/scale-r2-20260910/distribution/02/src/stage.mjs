import {
  CAPTURE_STATUS,
  ERROR_CODES,
  INVENTORY_SCHEMA,
  PACKET_SCHEMA,
  PACKET_STATUS,
  PROVIDER_REVIEW,
} from "./constants.mjs";
import { stageError, validateInventory } from "./validate.mjs";

function defaultClock() {
  return Date.now();
}

export function buildRootHandoffPacket(inventory, options = {}) {
  const clock = options.clock || defaultClock;
  let inv;
  try {
    inv = validateInventory(inventory);
  } catch (err) {
    if (err.code === ERROR_CODES.MISSING_REQUIREMENT) {
      return {
        schema: PACKET_SCHEMA,
        status: PACKET_STATUS.BLOCKED_MISSING_INPUT,
        generatedAt: new Date(clock()).toISOString(),
        cite: typeof inventory?.cite === "string" ? inventory.cite : null,
        missingInputs: err.details?.missing || [err.message],
        recommendations: null,
        audienceCapture: null,
        mutationBoundary: mutationBoundary(),
        consumerInstructions: consumerInstructions(),
        error: { code: err.code, message: err.message, details: err.details || null },
      };
    }
    throw err;
  }

  const missing = [];
  if (!inv.evidence.demoPath) missing.push("evidence.demoPath");
  if (!inv.evidence.terminalPath) missing.push("evidence.terminalPath");
  if (!inv.evidence.zipSha256) missing.push("evidence.zipSha256");
  if (!inv.skill.zipFileName) missing.push("skill.zipFileName");

  const ac = inv.audienceCapture;

  if (ac.status === CAPTURE_STATUS.UNAVAILABLE) {
    return {
      schema: PACKET_SCHEMA,
      status: PACKET_STATUS.UNAVAILABLE,
      generatedAt: new Date(clock()).toISOString(),
      inventorySchema: INVENTORY_SCHEMA,
      cite: inv.cite,
      provider: inv.provider,
      skillSummary: skillSummary(inv.skill),
      missingInputs: [],
      recommendations: null,
      providerReview: normalizeReview(inv.providerReview),
      audienceCapture: {
        status: CAPTURE_STATUS.UNAVAILABLE,
        code: ERROR_CODES.UNAVAILABLE,
        label: "provider_capture_unavailable",
        reason: ac.reason || "provider or capture read unavailable",
      },
      mutationBoundary: mutationBoundary(),
      consumerInstructions: consumerInstructions(),
      evidencePointers: evidencePointers(inv),
    };
  }

  if (missing.length) {
    return {
      schema: PACKET_SCHEMA,
      status: PACKET_STATUS.BLOCKED_MISSING_INPUT,
      generatedAt: new Date(clock()).toISOString(),
      inventorySchema: INVENTORY_SCHEMA,
      cite: inv.cite,
      provider: inv.provider,
      skillSummary: skillSummary(inv.skill),
      missingInputs: missing,
      recommendations: null,
      providerReview: normalizeReview(inv.providerReview),
      audienceCapture: normalizeAudience(ac),
      mutationBoundary: mutationBoundary(),
      consumerInstructions: consumerInstructions(),
      evidencePointers: evidencePointers(inv),
    };
  }

  const audience = normalizeAudience(ac);
  let status = PACKET_STATUS.READY_FOR_ROOT;
  if (audience.status === CAPTURE_STATUS.NO_USERS) {
    status = PACKET_STATUS.NO_USERS;
  } else if (inv.providerReview.status === PROVIDER_REVIEW.PENDING_REVIEW) {
    status = PACKET_STATUS.PENDING_REVIEW_HANDOFF;
  }

  return {
    schema: PACKET_SCHEMA,
    status,
    generatedAt: new Date(clock()).toISOString(),
    inventorySchema: INVENTORY_SCHEMA,
    cite: inv.cite,
    provider: inv.provider,
    skillSummary: skillSummary(inv.skill),
    missingInputs: [],
    recommendations: {
      pricingType: "free",
      payoutSetupRequired: false,
      resubmit: false,
      ownerNextEvent: "Root owns next Agensi provider-review event — do not Bot-login or re-submit",
      exactDemoPointer: inv.evidence.demoPath,
      checklist: [
        "Confirm Free skill ZIP + DEMO still match polished S131 receipts",
        "Do not re-submit for review from this worker",
        "Root handles PendingReview outcome / any provider follow-up",
        "No Agensi Bot login redo",
      ],
    },
    providerReview: normalizeReview(inv.providerReview),
    audienceCapture: audience,
    mutationBoundary: mutationBoundary(),
    consumerInstructions: consumerInstructions(),
    evidencePointers: evidencePointers(inv),
  };
}

function skillSummary(skill) {
  return {
    name: skill.name,
    pricingType: skill.pricingType,
    skillMdName: skill.skillMdName,
    zipFileName: skill.zipFileName || null,
    version: skill.version || null,
  };
}

function normalizeReview(pr) {
  return {
    status: pr.status,
    resubmit: false,
    owner: "Root",
    note:
      pr.status === PROVIDER_REVIEW.PENDING_REVIEW
        ? "Already PendingReview; Root owns next provider-review event"
        : pr.note || null,
  };
}

function normalizeAudience(ac) {
  if (ac.status === CAPTURE_STATUS.UNAVAILABLE) {
    return {
      status: CAPTURE_STATUS.UNAVAILABLE,
      code: ERROR_CODES.UNAVAILABLE,
      label: "provider_capture_unavailable",
      reason: ac.reason || "provider or capture read unavailable",
    };
  }
  if (ac.status === CAPTURE_STATUS.NO_USERS) {
    return {
      status: CAPTURE_STATUS.NO_USERS,
      code: ERROR_CODES.NO_USERS,
      label: "capture_succeeded_zero_users",
      users: 0,
      installs: ac.installs === undefined ? 0 : ac.installs,
      runs: ac.runs === undefined ? 0 : ac.runs,
      reason: ac.reason || "capture succeeded; zero users/installs/runs",
    };
  }
  return {
    status: CAPTURE_STATUS.CAPTURED,
    label: "capture_succeeded",
    users: ac.users ?? null,
    installs: ac.installs ?? null,
    runs: ac.runs ?? null,
  };
}

function mutationBoundary() {
  return {
    executesProviderMutations: false,
    forbids: [
      "Agensi Bot login redo",
      "re-submit for review",
      "paid listing / payout setup",
      "rebuild skill package source",
      "merge to default",
      "CloudAgent",
    ],
    ownerOfProviderReview: "Root",
  };
}

function evidencePointers(inv) {
  return {
    receiptRefs: inv.evidence.receiptRefs,
    terminalPath: inv.evidence.terminalPath || null,
    demoPath: inv.evidence.demoPath || null,
    fieldValuesPath: inv.evidence.fieldValuesPath || null,
    zipReceiptPath: inv.evidence.zipReceiptPath || null,
    zipSha256: inv.evidence.zipSha256 || null,
    polishedCheckout: inv.evidence.polishedCheckout || null,
    preservePackagePath: inv.evidence.preservePackagePath || null,
  };
}

function consumerInstructions() {
  return [
    "node experiments/scale-r2-20260910/distribution/02/src/cli.mjs demo",
    "node experiments/scale-r2-20260910/distribution/02/src/cli.mjs stage experiments/scale-r2-20260910/distribution/02/fixtures/inventory.positive.json",
    "node experiments/scale-r2-20260910/distribution/02/src/cli.mjs validate /tmp/r2-dist-02-packet.json",
    "npm run test:r2-distribution-02",
    "Root owns PendingReview next event; this kit only stages handoff.",
  ].join("\n");
}

export function assertCaptureDistinct(unavailablePacket, noUsersPacket) {
  if (unavailablePacket.status !== PACKET_STATUS.UNAVAILABLE) {
    throw stageError(ERROR_CODES.INVALID_INPUT, "expected unavailable packet status");
  }
  if (unavailablePacket.audienceCapture?.status !== CAPTURE_STATUS.UNAVAILABLE) {
    throw stageError(ERROR_CODES.INVALID_INPUT, "expected unavailable audienceCapture");
  }
  if (unavailablePacket.audienceCapture?.users === 0) {
    throw stageError(
      ERROR_CODES.INVALID_INPUT,
      "unavailable must not report users=0 (that would collapse into no_users)",
    );
  }
  if (noUsersPacket.status !== PACKET_STATUS.NO_USERS) {
    throw stageError(ERROR_CODES.INVALID_INPUT, "expected no_users packet status");
  }
  if (noUsersPacket.audienceCapture?.status !== CAPTURE_STATUS.NO_USERS) {
    throw stageError(ERROR_CODES.INVALID_INPUT, "expected no_users audienceCapture");
  }
  if (unavailablePacket.status === noUsersPacket.status) {
    throw stageError(ERROR_CODES.INVALID_INPUT, "statuses collapsed");
  }
  return true;
}
