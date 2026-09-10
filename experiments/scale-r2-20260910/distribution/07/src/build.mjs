import {
  ERROR_CODES,
  GREXAL_S149,
  PACKET_SCHEMA,
  PACKET_STATUS,
} from "./constants.mjs";
import { packetError, validateRequest } from "./validate.mjs";

function defaultClock() {
  return Date.now();
}

/**
 * Build a concise executable counterparty delivery packet from a verified request.
 * Kill if requesterAlreadyHasFix or unresolved===false with fixEvidence.
 * unavailable ≠ no_users for capture outcomes.
 */
export function buildHandoffPacket(requestDoc, options = {}) {
  const clock = options.clock || defaultClock;

  let doc;
  try {
    doc = validateRequest(requestDoc, { softMissing: true });
  } catch (err) {
    if (err.code === ERROR_CODES.MISSING_REQUIREMENT) {
      return {
        schema: PACKET_SCHEMA,
        status: PACKET_STATUS.BLOCKED_MISSING_INPUT,
        code: ERROR_CODES.BLOCKED_MISSING_INPUT,
        generatedAt: new Date(clock()).toISOString(),
        cite: typeof requestDoc?.cite === "string" ? requestDoc.cite : null,
        requestId: requestDoc?.requestId ?? null,
        requesterId: requestDoc?.requesterId ?? null,
        artifactRef: null,
        runCommands: [],
        acceptanceChecks: [],
        privacyBounds: privacyBounds(),
        missingInputs: err.details?.missing || [err.message],
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
      schema: PACKET_SCHEMA,
      status: PACKET_STATUS.UNAVAILABLE,
      code: ERROR_CODES.UNAVAILABLE,
      label: "verified_request_capture_failed_or_unavailable",
      generatedAt: new Date(clock()).toISOString(),
      cite: doc.cite,
      reason: doc.reason || "verified request capture unavailable",
      requestId: doc.requestId ?? null,
      requesterId: doc.requesterId ?? null,
      artifactRef: null,
      runCommands: [],
      acceptanceChecks: [],
      privacyBounds: privacyBounds(),
      missingInputs: [],
      truthNotes: [
        "Verified-request capture failed or unavailable — do not claim zero requesters/users.",
        "unavailable ≠ no_users.",
        "Do not invent buyers or revenue.",
      ],
      mutationBoundary: mutationBoundary(),
      evidenceIndex: "evidence/INDEX.md",
      // Explicitly omit requesterCount
    };
  }

  const requesterCount =
    typeof doc.requesterCount === "number" && Number.isFinite(doc.requesterCount)
      ? doc.requesterCount
      : countRequesters(doc);

  if (requesterCount === 0) {
    return {
      schema: PACKET_SCHEMA,
      status: PACKET_STATUS.NO_USERS,
      code: ERROR_CODES.NO_USERS,
      label: "capture_succeeded_zero_verified_requesters",
      generatedAt: new Date(clock()).toISOString(),
      cite: doc.cite,
      reason: doc.reason || "capture succeeded; verified requester count is zero",
      requestId: doc.requestId ?? null,
      requesterId: doc.requesterId ?? null,
      artifactRef: null,
      runCommands: [],
      acceptanceChecks: [],
      privacyBounds: privacyBounds(),
      requesterCount: 0,
      missingInputs: [],
      truthNotes: [
        "Capture succeeded with zero verified requesters (no_users).",
        "This is distinct from unavailable (capture failed).",
        "Do not invent requesters, buyers, or revenue.",
      ],
      mutationBoundary: mutationBoundary(),
      evidenceIndex: "evidence/INDEX.md",
    };
  }

  // Kill path: requester already has a fix
  const kill = detectKill(doc);
  if (kill) {
    return {
      schema: PACKET_SCHEMA,
      status: PACKET_STATUS.KILLED_REQUESTER_HAS_FIX,
      code: ERROR_CODES.KILLED_REQUESTER_HAS_FIX,
      label: "requester_already_has_fix",
      generatedAt: new Date(clock()).toISOString(),
      cite: doc.cite,
      requestId: doc.requestId,
      requesterId: doc.requesterId,
      problemSummary: doc.problemSummary,
      unresolved: doc.unresolved,
      requesterAlreadyHasFix: doc.requesterAlreadyHasFix,
      fixEvidence: doc.fixEvidence ?? null,
      killReason: kill.reason,
      killSignals: kill.signals,
      artifactRef: null,
      runCommands: [],
      acceptanceChecks: [],
      privacyBounds: privacyBounds(),
      missingInputs: [],
      truthNotes: [
        "Kill: requester already has a fix — do not produce executable handoff commands.",
        "Extend existing evidence only; no invented buyers/revenue.",
      ],
      mutationBoundary: mutationBoundary(),
      evidenceIndex: "evidence/INDEX.md",
    };
  }

  // Ready handoff for unresolved verified request without fix
  const artifactRef = resolveArtifactRef(doc);
  const runCommands = resolveRunCommands(doc, artifactRef);
  const acceptanceChecks = resolveAcceptanceChecks(doc);

  return {
    schema: PACKET_SCHEMA,
    status: PACKET_STATUS.READY_HANDOFF,
    label: "counterparty_delivery_packet_ready",
    generatedAt: new Date(clock()).toISOString(),
    cite: doc.cite,
    requestId: doc.requestId,
    requesterId: doc.requesterId,
    problemSummary: doc.problemSummary,
    unresolved: true,
    requesterAlreadyHasFix: false,
    artifactRef,
    runCommands,
    acceptanceChecks,
    privacyBounds: privacyBounds(),
    requesterCount,
    missingInputs: [],
    truthNotes: truthNotes(),
    mutationBoundary: mutationBoundary(),
    evidenceIndex: "evidence/INDEX.md",
    handoffGate: {
      requiresUnresolved: true,
      requiresRequesterLacksFix: true,
      note: "Executable commands emitted only when unresolved and requesterAlreadyHasFix===false",
    },
  };
}

/**
 * Detect kill conditions.
 * - requesterAlreadyHasFix === true
 * - unresolved === false with fixEvidence (or equivalent)
 */
export function detectKill(doc) {
  const signals = [];
  if (doc.requesterAlreadyHasFix === true) {
    signals.push("requesterAlreadyHasFix=true");
  }
  if (doc.unresolved === false) {
    const hasFixEvidence =
      doc.fixEvidence != null ||
      doc.hasFix === true ||
      (typeof doc.fixRef === "string" && doc.fixRef.trim().length > 0);
    if (hasFixEvidence || doc.requesterAlreadyHasFix === true) {
      signals.push("unresolved=false_with_fixEvidence");
    } else if (doc.unresolved === false) {
      // Resolved without explicit fix flag still kills delivery of a "fix" packet
      // when the request is no longer unresolved — no executable handoff needed.
      signals.push("unresolved=false");
    }
  }
  if (signals.length === 0) return null;
  return {
    reason:
      "Requester already has a fix (or request is resolved) — kill counterparty delivery packet",
    signals,
  };
}

export function assertCaptureDistinct(unavailablePacket, noUsersPacket) {
  if (!unavailablePacket || unavailablePacket.status !== PACKET_STATUS.UNAVAILABLE) {
    throw packetError(ERROR_CODES.INVALID_INPUT, "expected unavailable status");
  }
  if (Object.prototype.hasOwnProperty.call(unavailablePacket, "requesterCount")) {
    throw packetError(
      ERROR_CODES.INVALID_INPUT,
      "unavailable must not report requesterCount (would collapse into no_users)",
    );
  }
  if (!noUsersPacket || noUsersPacket.status !== PACKET_STATUS.NO_USERS) {
    throw packetError(ERROR_CODES.INVALID_INPUT, "expected no_users status");
  }
  if (unavailablePacket.status === noUsersPacket.status) {
    throw packetError(ERROR_CODES.INVALID_INPUT, "capture statuses collapsed");
  }
  if (unavailablePacket.code === noUsersPacket.code) {
    throw packetError(ERROR_CODES.INVALID_INPUT, "capture codes collapsed");
  }
  return true;
}

export function assertKillHasNoCommands(packet) {
  if (!packet || packet.status !== PACKET_STATUS.KILLED_REQUESTER_HAS_FIX) {
    throw packetError(ERROR_CODES.INVALID_INPUT, "expected killed_requester_has_fix");
  }
  if (!Array.isArray(packet.runCommands) || packet.runCommands.length !== 0) {
    throw packetError(
      ERROR_CODES.INVALID_INPUT,
      "kill path must not emit executable runCommands",
    );
  }
  return true;
}

function countRequesters(doc) {
  if (Array.isArray(doc.verifiedRequesters)) return doc.verifiedRequesters.length;
  if (doc.requesterObserved === true) return 1;
  if (typeof doc.requesterId === "string" && doc.requesterId.trim()) return 1;
  return 0;
}

function resolveArtifactRef(doc) {
  const hints = doc.artifactHints && typeof doc.artifactHints === "object"
    ? doc.artifactHints
    : {};
  return {
    type: hints.type || GREXAL_S149.artifactType,
    productSlug: hints.productSlug || GREXAL_S149.productSlug,
    packagePath: hints.packagePath || GREXAL_S149.packagePath,
    packageReadme: hints.packageReadme || GREXAL_S149.packageReadme,
    surface: GREXAL_S149.surface,
    listingStatus: hints.listingStatus || GREXAL_S149.listingStatus,
    agentId: hints.agentId || GREXAL_S149.agentId,
    deploymentVersion: hints.deploymentVersion || GREXAL_S149.deploymentVersion,
    pricingRunCompletedUsd:
      typeof hints.pricingRunCompletedUsd === "number"
        ? hints.pricingRunCompletedUsd
        : GREXAL_S149.pricingRunCompletedUsd,
    estimateReserveUsd:
      typeof hints.estimateReserveUsd === "number"
        ? hints.estimateReserveUsd
        : GREXAL_S149.estimateReserveUsd,
    estimateReserveIsCharge: false,
    customerExecutionRevenuePayout: false,
    receiptRef: hints.receiptRef || GREXAL_S149.receiptRef,
    note:
      hints.note ||
      "S149 Grexal source-change evidence pack as deliverable artifact type — list pricing 0.02 ≠ revenue; no customer revenue claimed",
  };
}

function resolveRunCommands(doc, artifactRef) {
  if (Array.isArray(doc.runCommands) && doc.runCommands.length > 0) {
    return doc.runCommands.map((c) => ({
      command: c.command,
      cwd: c.cwd || artifactRef.packagePath,
      note: c.note || "local install/run hint — not a provider mutation",
      evidenceRef: c.evidenceRef || artifactRef.packageReadme,
    }));
  }
  const pkg = artifactRef.packagePath;
  return [
    {
      command: "npm test",
      cwd: pkg,
      note: "Local package tests from Grexal S124 package; no Grexal/Agensi login",
      evidenceRef: artifactRef.packageReadme,
    },
    {
      command:
        "node agent/pack_evidence.js --unifiedDiffFile fixtures/diff/simple.patch --buyerCriteriaFile fixtures/criteria/require-structural.json --stdout-only",
      cwd: pkg,
      note: "Quoted from Grexal package README; local pack run; list price 0.02 ≠ revenue",
      evidenceRef: artifactRef.packageReadme,
    },
    {
      command: "node bin/validate-manifest.mjs",
      cwd: pkg,
      note: "Local manifest validate; no publish / price / review-submit",
      evidenceRef: artifactRef.packageReadme,
    },
  ];
}

function resolveAcceptanceChecks(doc) {
  if (Array.isArray(doc.acceptanceChecks) && doc.acceptanceChecks.length > 0) {
    return doc.acceptanceChecks.slice();
  }
  return [
    "positive: unresolved verified request without requester fix → ready_handoff with non-empty runCommands",
    "kill: requesterAlreadyHasFix=true → killed_requester_has_fix and empty runCommands",
    "kill: unresolved=false with fixEvidence → killed_requester_has_fix and empty runCommands",
    "negative: invented revenue / broadcast / buyer fields rejected",
    "partial: missing requestId/requesterId/problemSummary → blocked_missing_input",
    "unavailable ≠ no_users (unavailable omits requesterCount; no_users sets it to 0)",
    "artifactRef cites Grexal S149 PUBLIC_ACTIVE receipt; pricingRunCompletedUsd 0.02 is list price not revenue",
  ];
}

function privacyBounds() {
  return {
    noBroadcast: true,
    noInventedBuyers: true,
    noInventedRevenue: true,
    noProviderLogin: true,
    noPricePublishReviewSubmit: true,
    listPriceIsNotRevenue: true,
    notes: [
      "Counterparty packet is for a specific verified request only — no fan-out.",
      "No unsolicited broadcast fields.",
      "S149 list pricing ≠ customer revenue/payout.",
      "unavailable omits requesterCount; no_users sets it to 0.",
    ],
  };
}

function truthNotes() {
  return [
    "DEMO ties deliverable artifact type to Grexal PUBLIC ACTIVE S149 (agentId j970cajvv6wbrmy64s2f4ajzw18e5j2q, run_completed 0.02 USD) — no customer revenue claimed.",
    "Synthetic fixtures for request shapes; S149 receipt is the real marketplace surface citation.",
    "Kill when requesterAlreadyHasFix=true or unresolved=false with fix evidence.",
    "unavailable ≠ no_users; no invented buyers/revenue/broadcast.",
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
      "invent buyers or revenue",
      "collapse unavailable into no_users",
      "emit runCommands when requesterAlreadyHasFix",
      "claim list price as customer revenue",
    ],
    ownerOfPublicationAndPrice: "Root",
    ownerOfPendingReviewOutcome: "Root",
    killWhenRequesterHasFix: true,
  };
}
