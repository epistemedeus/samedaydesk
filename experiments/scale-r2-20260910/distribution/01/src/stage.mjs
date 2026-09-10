import {
  CAPTURE_STATUS,
  DRAFT_VISIBILITY_NOTES,
  ERROR_CODES,
  INVENTORY_SCHEMA,
  PACKET_SCHEMA,
  PACKET_STATUS,
  RECOMMENDED_PRICE,
} from "./constants.mjs";
import { stageError, validateInventory } from "./validate.mjs";

function defaultClock() {
  return Date.now();
}

function priceOk(rec) {
  if (!rec || typeof rec !== "object") return { ok: false, missing: ["priceRecommendation"] };
  const missing = [];
  if (rec.unit !== RECOMMENDED_PRICE.unit) missing.push("priceRecommendation.unit");
  if (rec.amountUsd !== RECOMMENDED_PRICE.amountUsd) missing.push("priceRecommendation.amountUsd");
  if (rec.amountMicros !== RECOMMENDED_PRICE.amountMicros) {
    missing.push("priceRecommendation.amountMicros");
  }
  if (rec.applied === true) {
    return {
      ok: false,
      missing: ["priceRecommendation.applied_must_be_false"],
      reason: "kit must never claim price was applied",
    };
  }
  return { ok: missing.length === 0, missing };
}

/**
 * Build a Root action packet from staging inventory.
 * Recommendations only — never mutates Grexal / never publishes / never sets price.
 */
export function buildRootActionPacket(inventory, options = {}) {
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
        inventorySchema: inventory?.schema ?? null,
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

  const ac = inv.audienceCapture;
  const missing = [];

  if (!inv.draft.deployment || inv.draft.deployment.version === undefined) {
    missing.push("draft.deployment.version");
  }
  if (!inv.evidence.preserveTip) missing.push("evidence.preserveTip");
  if (!inv.evidence.terminalPath) missing.push("evidence.terminalPath");

  const price = priceOk(inv.priceRecommendation);
  if (!price.ok) missing.push(...price.missing);

  // Provider capture unavailable → packet unavailable (DISTINCT from no_users)
  if (ac.status === CAPTURE_STATUS.UNAVAILABLE) {
    return {
      schema: PACKET_SCHEMA,
      status: PACKET_STATUS.UNAVAILABLE,
      generatedAt: new Date(clock()).toISOString(),
      inventorySchema: INVENTORY_SCHEMA,
      cite: inv.cite,
      provider: inv.provider,
      draftSummary: summarizeDraft(inv.draft),
      missingInputs: [],
      recommendations: null,
      audienceCapture: {
        status: CAPTURE_STATUS.UNAVAILABLE,
        code: ERROR_CODES.UNAVAILABLE,
        label: "provider_capture_unavailable",
        reason: ac.reason || "provider or capture read unavailable",
        // Explicitly omit users — unavailable ≠ zero users
      },
      publicDiscoveryChecklist: null,
      noChargeOwnerReadback: noChargeOwnerReadback(),
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
      draftSummary: summarizeDraft(inv.draft),
      missingInputs: missing,
      recommendations: null,
      audienceCapture: normalizeAudience(ac),
      publicDiscoveryChecklist: null,
      noChargeOwnerReadback: noChargeOwnerReadback(),
      mutationBoundary: mutationBoundary(),
      consumerInstructions: consumerInstructions(),
      evidencePointers: evidencePointers(inv),
    };
  }

  const audience = normalizeAudience(ac);
  const status =
    audience.status === CAPTURE_STATUS.NO_USERS
      ? PACKET_STATUS.NO_USERS
      : PACKET_STATUS.READY_FOR_ROOT;

  return {
    schema: PACKET_SCHEMA,
    status,
    generatedAt: new Date(clock()).toISOString(),
    inventorySchema: INVENTORY_SCHEMA,
    cite: inv.cite,
    provider: inv.provider,
    draftSummary: summarizeDraft(inv.draft),
    missingInputs: [],
    recommendations: {
      price: {
        ...RECOMMENDED_PRICE,
        applied: false,
        sourceWorksheet: inv.priceRecommendation.sourceWorksheet || null,
      },
      visibility: {
        keepPrivateUntilPrice: true,
        current: {
          status: inv.draft.status,
          visibility: inv.draft.visibility,
          pricing: inv.draft.pricing,
        },
        notes: DRAFT_VISIBILITY_NOTES,
      },
      publish: {
        execute: false,
        owner: "Root",
        note: "Root owns actual publication and price set; this packet is staging only",
      },
    },
    audienceCapture: audience,
    publicDiscoveryChecklist: [
      "Confirm draft still status=draft visibility=private pricing=unset (or expected post-price state)",
      "Review worksheet: intentional small flat run_completed 0.10 (100000 micros); paidModelCalls=0",
      "Root sets price intentionally (not this kit)",
      "Root decides visibility / public discovery after price",
      "Root owns grexal publish / dashboard publish of deployment",
      "Self-run free path remains for owner readback (no-charge)",
    ],
    noChargeOwnerReadback: noChargeOwnerReadback(),
    mutationBoundary: mutationBoundary(),
    consumerInstructions: consumerInstructions(),
    evidencePointers: evidencePointers(inv),
  };
}

function summarizeDraft(draft) {
  return {
    slug: draft.slug,
    agentId: draft.agentId || "agentId_REDACTED",
    status: draft.status,
    visibility: draft.visibility,
    pricing: draft.pricing,
    deployment: draft.deployment || null,
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

function noChargeOwnerReadback() {
  return {
    selfRunsFree: true,
    steps: [
      "Owner may invoke draft deployment for self-test (no earnings entry)",
      "Do not purchase credits for owner readback",
      "Record readback under receipts; do not write agentIds into package stubs",
    ],
    note: DRAFT_VISIBILITY_NOTES.selfRuns,
  };
}

function mutationBoundary() {
  return {
    executesProviderMutations: false,
    forbids: [
      "grexal login (repeat)",
      "grexal push --publish",
      "grexal publish",
      "grexal agent price",
      "grexal agent set-visibility",
      "rebuild grexal package source",
      "merge to default",
    ],
    ownerOfPublicationAndPrice: "Root",
  };
}

function evidencePointers(inv) {
  return {
    receiptRefs: inv.evidence.receiptRefs,
    terminalPath: inv.evidence.terminalPath || null,
    costVerifyPath: inv.evidence.costVerifyPath || null,
    preserveTip: inv.evidence.preserveTip || null,
    preservePackagePath: inv.evidence.preservePackagePath || null,
    stagingPath: inv.evidence.stagingPath || null,
  };
}

function consumerInstructions() {
  return [
    "node experiments/scale-r2-20260910/distribution/01/src/cli.mjs demo",
    "node experiments/scale-r2-20260910/distribution/01/src/cli.mjs stage experiments/scale-r2-20260910/distribution/01/fixtures/inventory.positive.json",
    "node experiments/scale-r2-20260910/distribution/01/src/cli.mjs validate /tmp/r2-dist-01-packet.json",
    "npm run test:r2-distribution-01",
    "Root owns price/publish/visibility; this kit only stages recommendations.",
  ].join("\n");
}

/** Guard used by tests: unavailable and no_users must remain distinct codes. */
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
  if (unavailablePacket.audienceCapture.status === noUsersPacket.audienceCapture.status) {
    throw stageError(ERROR_CODES.INVALID_INPUT, "audienceCapture statuses collapsed");
  }
  return true;
}
