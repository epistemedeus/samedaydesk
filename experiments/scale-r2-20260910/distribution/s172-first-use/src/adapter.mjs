import {
  RESPONSE_SCHEMA,
  OUTCOME,
  NEXT_ACTION,
  GREXAL_LISTING,
  ERROR_CODES,
} from "./constants.mjs";

function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/**
 * No-key machine-readable first-use response adapter.
 * Maps a first-use attempt (discovery / readiness) to outcome + artifact + nextAction.
 * Never invents traffic, never executes paid invoke.
 */
export function adaptFirstUseResponse(attempt, options = {}) {
  const clock = options.clock || (() => Date.now());
  const generatedAt = new Date(clock()).toISOString();

  if (!isPlainObject(attempt)) {
    return failure(generatedAt, ERROR_CODES.MALFORMED, "attempt must be an object", {
      nextAction: NEXT_ACTION.RETRY_DISCOVERY,
    });
  }

  if (attempt.inventedTraffic === true || attempt.syntheticCustomer === true) {
    return failure(generatedAt, ERROR_CODES.INVENTED_TRAFFIC, "invented traffic/customer forbidden", {
      nextAction: NEXT_ACTION.STOP_PAID_RISK,
    });
  }

  if (attempt.paidInvokeExecuted === true) {
    return failure(generatedAt, ERROR_CODES.PAID_INVOKE, "paid invoke must not be executed by this adapter", {
      nextAction: NEXT_ACTION.STOP_PAID_RISK,
    });
  }

  const kind = attempt.kind;
  if (typeof kind !== "string" || !kind) {
    return failure(generatedAt, ERROR_CODES.MISSING, "kind required", {
      nextAction: NEXT_ACTION.RETRY_DISCOVERY,
      missing: ["kind"],
    });
  }

  // Success path: anonymous discovery of public listing (no key)
  if (kind === "discovery" && attempt.ok === true) {
    const listingUrl = attempt.listingUrl || GREXAL_LISTING.url;
    const agentId = attempt.agentId || GREXAL_LISTING.agentId;
    if (listingUrl !== GREXAL_LISTING.url || agentId !== GREXAL_LISTING.agentId) {
      return failure(generatedAt, ERROR_CODES.MALFORMED, "listing must match observed Grexal PUBLIC ACTIVE id URL", {
        nextAction: NEXT_ACTION.RETRY_DISCOVERY,
      });
    }
    return {
      schema: RESPONSE_SCHEMA,
      outcome: OUTCOME.SUCCESS,
      generatedAt,
      noKey: true,
      paidInvokeExecuted: false,
      artifact: {
        type: "listing_discovery",
        listingUrl,
        agentId,
        httpStatus: attempt.httpStatus ?? 200,
        freeVsPriced: "discovery_free_run_priced",
        listPriceUsd: GREXAL_LISTING.listPriceUsd,
        estimateReserveUsd: GREXAL_LISTING.estimateReserveUsd,
        estimateReserveIsCharge: false,
      },
      nextAction: NEXT_ACTION.CONFIRM_BUDGET,
      nextActionDetail:
        "Confirm $0.02 list price; reserve $0.025 is not a charge. STOP before marketplace Run.",
      mutationBoundary: boundary(),
    };
  }

  // Success: local offline pack readiness (no marketplace charge)
  if (kind === "local_offline" && attempt.ok === true) {
    return {
      schema: RESPONSE_SCHEMA,
      outcome: OUTCOME.SUCCESS,
      generatedAt,
      noKey: true,
      paidInvokeExecuted: false,
      artifact: {
        type: "local_offline_readiness",
        commands: attempt.commands || [
          "npm test",
          "node agent/pack_evidence.js --unifiedDiffFile fixtures/diff/simple.patch --stdout-only",
        ],
        note: "Local preserve package path — free; not a Grexal paid run",
      },
      nextAction: NEXT_ACTION.USE_LOCAL_OFFLINE,
      nextActionDetail: "Run local offline pack commands; do not claim marketplace adoption.",
      mutationBoundary: boundary(),
    };
  }

  // Failure: discovery unavailable (not no_users)
  if (kind === "discovery" && attempt.ok === false) {
    const status = attempt.captureStatus === "no_users" ? "no_users" : "unavailable";
    return {
      schema: RESPONSE_SCHEMA,
      outcome: OUTCOME.FAILURE,
      generatedAt,
      noKey: true,
      paidInvokeExecuted: false,
      artifact: {
        type: "discovery_failure",
        captureStatus: status,
        reason: attempt.reason || "listing capture failed or empty",
        note:
          status === "no_users"
            ? "capture succeeded with zero users — distinct from unavailable"
            : "provider/listing capture unavailable — distinct from no_users",
      },
      nextAction:
        status === "no_users" ? NEXT_ACTION.OPEN_LISTING : NEXT_ACTION.RETRY_DISCOVERY,
      error: { code: "discovery_failed", message: attempt.reason || "discovery failed" },
      mutationBoundary: boundary(),
    };
  }

  // Agensi hold
  if (kind === "agensi") {
    return {
      schema: RESPONSE_SCHEMA,
      outcome: OUTCOME.FAILURE,
      generatedAt,
      noKey: true,
      paidInvokeExecuted: false,
      artifact: {
        type: "agensi_hold",
        status: "pending_review",
        installs: 0,
        note: "WAIT — do not resubmit",
      },
      nextAction: NEXT_ACTION.HOLD_AGENSI,
      mutationBoundary: boundary(),
    };
  }

  return failure(generatedAt, ERROR_CODES.MALFORMED, `unsupported kind/ok combination: ${kind}`, {
    nextAction: NEXT_ACTION.RETRY_DISCOVERY,
  });
}

function boundary() {
  return {
    noPaidInvoke: true,
    noInventedTraffic: true,
    noLoginRequiredForAdapter: true,
    productionMerge: false,
  };
}

function failure(generatedAt, code, message, extra = {}) {
  return {
    schema: RESPONSE_SCHEMA,
    outcome: OUTCOME.FAILURE,
    generatedAt,
    noKey: true,
    paidInvokeExecuted: false,
    artifact: { type: "adapter_error", code, message },
    nextAction: extra.nextAction || NEXT_ACTION.RETRY_DISCOVERY,
    nextActionDetail: extra.nextActionDetail || null,
    error: { code, message, missing: extra.missing || null },
    mutationBoundary: boundary(),
  };
}
