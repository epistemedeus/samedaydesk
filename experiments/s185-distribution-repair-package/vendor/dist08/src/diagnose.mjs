import {
  ACQUISITION_KINDS,
  CAPTURE_STATUS,
  DEFAULT_PROVIDER_SOURCE_MAP,
  DIAGNOSIS_SCHEMA,
  DIAGNOSIS_STATUS,
  ERROR_CODES,
  GREXAL_S149,
  OUTPUT_KINDS,
  PROVIDERS,
  SOURCE_TAGS,
} from "./constants.mjs";
import { diagnosisError, validateBundle } from "./validate.mjs";

function defaultClock() {
  return Date.now();
}

/**
 * Resolve acquisition provider from explicit provider or sourceTag mapping.
 */
export function resolveAcquisitionProvider(acq, providerSourceMap) {
  if (acq.provider && Object.values(PROVIDERS).includes(acq.provider)) {
    return acq.provider;
  }
  const map = providerSourceMap || DEFAULT_PROVIDER_SOURCE_MAP;
  const mapped = map[acq.sourceTag];
  if (Array.isArray(mapped) && mapped.length === 1) {
    return mapped[0];
  }
  // catalog/manual with multiple providers → null (needs jobRef/sharedEvidenceId)
  return null;
}

/**
 * Decide whether an acquisition event and a useful-output event are source-compatible.
 * Compatible when any of:
 *  - sharedEvidenceId matches (non-empty)
 *  - jobRef matches (both non-empty)
 *  - acquisition provider (or uniquely mapped sourceTag) equals output.provider
 *  - sourceTag is in providerSourceMap[output.provider] AND (unique map OR
 *    allowBroadSourceJoin)
 *
 * catalog/manual alone without jobRef/sharedEvidenceId are compatible with a
 * provider only when that sourceTag maps uniquely OR allowCatalogManualCrossProvider.
 */
export function isCompatible(acq, out, compatibility = {}) {
  const reasons = [];
  const keys = [];

  const map = compatibility.providerSourceMap || DEFAULT_PROVIDER_SOURCE_MAP;
  const allowCatalogManual =
    compatibility.allowCatalogManualCrossProvider === true;

  const sharedId =
    typeof acq.sharedEvidenceId === "string" &&
    acq.sharedEvidenceId.trim() &&
    acq.sharedEvidenceId === out.sharedEvidenceId
      ? acq.sharedEvidenceId
      : null;
  if (sharedId) {
    keys.push("sharedEvidenceId");
  }

  const jobRef =
    typeof acq.jobRef === "string" &&
    acq.jobRef.trim() &&
    acq.jobRef === out.jobRef
      ? acq.jobRef
      : null;
  if (jobRef) {
    keys.push("jobRef");
  }

  const acqProvider = resolveAcquisitionProvider(acq, map);
  if (acqProvider && acqProvider === out.provider) {
    keys.push("provider");
  }

  // sourceTag → provider membership
  const taggedProviders = map[acq.sourceTag] || [];
  if (taggedProviders.includes(out.provider)) {
    const unique = taggedProviders.length === 1;
    const isBroad =
      acq.sourceTag === SOURCE_TAGS.CATALOG ||
      acq.sourceTag === SOURCE_TAGS.MANUAL;
    if (unique || (isBroad && (allowCatalogManual || jobRef || sharedId))) {
      if (!keys.includes("sourceTag") && (unique || allowCatalogManual)) {
        keys.push("sourceTag");
      } else if (unique && !keys.includes("sourceTag")) {
        keys.push("sourceTag");
      }
    }
  }

  // Require at least one compatibility key
  if (keys.length === 0) {
    // Explain why
    if (acqProvider && acqProvider !== out.provider) {
      reasons.push(
        `incompatible_provider: acquisition=${acqProvider} output=${out.provider}`,
      );
    } else if (!acqProvider) {
      reasons.push(
        `incompatible_ambiguous_sourceTag: sourceTag=${acq.sourceTag} needs jobRef or sharedEvidenceId to join provider=${out.provider}`,
      );
    } else {
      reasons.push(
        `incompatible: no matching provider|sourceTag|jobRef|sharedEvidenceId`,
      );
    }
    return { compatible: false, keys: [], reason: reasons.join("; ") };
  }

  // Hard reject: explicit provider mismatch even if sourceTag broad — unless shared id/jobRef
  if (
    acq.provider &&
    acq.provider !== out.provider &&
    !sharedId &&
    !jobRef
  ) {
    return {
      compatible: false,
      keys: [],
      reason: `incompatible_provider: acquisition=${acq.provider} output=${out.provider}`,
    };
  }

  return { compatible: true, keys: [...new Set(keys)], reason: null };
}

/**
 * Build unknowns list for a joined pair. Causation/independence default unknown.
 */
export function buildUnknowns(acq, out, causationKnown, independenceKnown) {
  const unknowns = [];
  if (!causationKnown) {
    unknowns.push(
      "causation: no sharedEvidenceId proving acquisition caused this useful output",
    );
  }
  if (!independenceKnown) {
    unknowns.push(
      "customerIndependence: no independentCustomerRef proving a distinct customer actor",
    );
  }
  unknowns.push(
    "conversion: linkPresented/linkActivated is not conversion (click ≠ conversion)",
  );
  if (out.kind === OUTPUT_KINDS.EARNINGS) {
    if (out.amount && typeof out.amount.value === "number") {
      unknowns.push(
        "revenue_attribution: observed earnings amount is not attributed to this acquisition without sharedEvidenceId",
      );
    } else {
      unknowns.push(
        "revenue: earnings evidence present without amount — status unavailable (not zero revenue)",
      );
    }
  } else if (out.pricing && typeof out.pricing.run_completed_usd === "number") {
    unknowns.push(
      `revenue: list pricing run_completed_usd=${out.pricing.run_completed_usd} is NOT earnings/payout (S149 customerExecutionRevenuePayout=false)`,
    );
  } else {
    unknowns.push(
      "revenue: no customer earnings/payout evidence joined — do not invent revenue from clicks or list price",
    );
  }
  if (acq.kind === ACQUISITION_KINDS.LINK_ACTIVATED) {
    unknowns.push(
      "intent: linkActivated does not imply buyerIntent or purchaseIntent",
    );
  }
  return unknowns;
}

function summarizeAcquisition(acq) {
  return {
    id: acq.id,
    kind: acq.kind,
    sourceTag: acq.sourceTag,
    provider: acq.provider ?? null,
    linkId: acq.linkId ?? null,
    jobRef: acq.jobRef ?? null,
    sharedEvidenceId: acq.sharedEvidenceId ?? null,
    independentCustomerRef: acq.independentCustomerRef ?? null,
    at: acq.at ?? null,
    evidenceRef: acq.evidenceRef ?? null,
  };
}

function summarizeOutput(out) {
  return {
    id: out.id,
    kind: out.kind,
    provider: out.provider,
    jobRef: out.jobRef ?? null,
    sharedEvidenceId: out.sharedEvidenceId ?? null,
    independentCustomerRef: out.independentCustomerRef ?? null,
    at: out.at ?? null,
    evidenceRef: out.evidenceRef ?? null,
    earningsStatus: out.earningsStatus ?? null,
    pricingObserved:
      out.pricing && typeof out.pricing === "object"
        ? {
            run_completed_usd:
              typeof out.pricing.run_completed_usd === "number"
                ? out.pricing.run_completed_usd
                : null,
            estimate_reserve_usd:
              typeof out.pricing.estimate_reserve_usd === "number"
                ? out.pricing.estimate_reserve_usd
                : null,
            estimateReserveIsCharge: out.pricing.estimateReserveIsCharge === true,
            isRevenue: false,
          }
        : null,
    amount:
      out.amount && typeof out.amount.value === "number"
        ? { value: out.amount.value, currency: out.amount.currency ?? null }
        : null,
  };
}

function actionableUsefulOutputs(outputs) {
  // install / run count as "useful" activations of the product; listed/draft/reviewed
  // are marketplace state, earnings may be unavailable
  return outputs.filter(
    (o) =>
      o.kind === OUTPUT_KINDS.INSTALL ||
      o.kind === OUTPUT_KINDS.RUN ||
      (o.kind === OUTPUT_KINDS.EARNINGS &&
        o.amount &&
        typeof o.amount.value === "number"),
  );
}

function activationCount(acquisitions) {
  return acquisitions.filter((a) => a.kind === ACQUISITION_KINDS.LINK_ACTIVATED)
    .length;
}

function mutationBoundary() {
  return {
    executesProviderMutations: false,
    forbids: [
      "grexal login",
      "agensi Bot login",
      "price / publish / review-submit",
      "invent buyers or revenue",
      "equate click/activation with conversion",
      "treat list pricing as earnings/payout",
      "claim causation without sharedEvidenceId",
      "claim customerIndependence without independentCustomerRef",
      "collapse unavailable into no_users",
      "join incompatible sourceTag/provider/jobRef pairs as converted",
    ],
    ownerOfPublicationAndPrice: "Root",
    ownerOfPendingReviewOutcome: "Root",
  };
}

function privacyNotes() {
  return [
    "Joins only source-compatible acquisition ↔ useful-output pairs.",
    "causationKnown defaults false unless sharedEvidenceId matches on both sides.",
    "customerIndependenceKnown defaults false unless independentCustomerRef matches.",
    "click/activation ≠ conversion; list pricing ≠ revenue.",
    "unavailable omits activationCount/usefulOutputActionableCount; no_users sets zeros.",
  ];
}

function truthNotes() {
  return [
    "DEMO fixtures extend DIST-04 acquisition + DIST-05 useful-output shapes; no fake buyers/revenue.",
    `Grexal S149: PUBLIC_ACTIVE agentId ${GREXAL_S149.agentId}; pricing run_completed ${GREXAL_S149.pricingRunCompletedUsd} USD (estimate reserve ${GREXAL_S149.estimateReserveUsd} is NOT a charge).`,
    "Grexal: customerExecutionRevenuePayout=false — earnings unavailable (pricing ≠ earnings).",
    "Agensi: Free PendingReview; 0 installs — do not invent installs/revenue.",
    "unavailable ≠ no_users; causation/independence unknown by default.",
  ];
}

/**
 * Join only source-compatible acquisition and useful-output evidence.
 * Surfaces exactly where causation or customer independence is unknown.
 */
export function diagnoseConversion(bundleDoc, options = {}) {
  const clock = options.clock || defaultClock;
  let doc;
  try {
    doc = validateBundle(bundleDoc);
  } catch (err) {
    if (err.code === ERROR_CODES.MISSING_REQUIREMENT) {
      return {
        schema: DIAGNOSIS_SCHEMA,
        status: DIAGNOSIS_STATUS.PARTIAL,
        generatedAt: new Date(clock()).toISOString(),
        cite: typeof bundleDoc?.cite === "string" ? bundleDoc.cite : null,
        joined: [],
        unjoined: [],
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

  if (
    doc.captureStatus === CAPTURE_STATUS.FAILED ||
    doc.captureStatus === CAPTURE_STATUS.UNAVAILABLE
  ) {
    return {
      schema: DIAGNOSIS_SCHEMA,
      status: DIAGNOSIS_STATUS.UNAVAILABLE,
      code: ERROR_CODES.UNAVAILABLE,
      label: "acquisition_or_output_capture_failed",
      generatedAt: new Date(clock()).toISOString(),
      cite: doc.cite,
      reason:
        doc.reason ||
        "acquisition or useful-output capture unavailable — do not claim zero users",
      joined: [],
      unjoined: [],
      missingInputs: [],
      privacyNotes: privacyNotes(),
      truthNotes: [
        "Capture failed or unavailable — do not claim zero activations or zero useful outputs.",
        "unavailable ≠ no_users.",
        "Do not invent conversion or revenue.",
      ],
      mutationBoundary: mutationBoundary(),
      evidenceIndex: "evidence/INDEX.md",
      grexalS149: {
        listingStatus: GREXAL_S149.listingStatus,
        pricingRunCompletedUsd: GREXAL_S149.pricingRunCompletedUsd,
        customerExecutionRevenuePayout: false,
        note: "Cited for marketplace state only; not a conversion claim",
      },
      // Explicitly omit activationCount / usefulOutputActionableCount
    };
  }

  const compatibility = doc.compatibility || {};
  const joined = [];
  const unjoined = [];

  // Pairwise join attempts (cartesian); only compatible pairs enter joined
  for (const acq of doc.acquisitionEvidence) {
    for (const out of doc.usefulOutputEvidence) {
      const result = isCompatible(acq, out, compatibility);
      if (!result.compatible) {
        unjoined.push({
          acquisitionId: acq.id,
          usefulOutputId: out.id,
          reason: result.reason || "incompatible",
          acquisitionSourceTag: acq.sourceTag,
          usefulOutputProvider: out.provider,
        });
        continue;
      }

      const sharedEvidenceId =
        typeof acq.sharedEvidenceId === "string" &&
        acq.sharedEvidenceId.trim() &&
        acq.sharedEvidenceId === out.sharedEvidenceId
          ? acq.sharedEvidenceId
          : null;

      const causationKnown = Boolean(sharedEvidenceId);

      const independenceKnown = Boolean(
        typeof acq.independentCustomerRef === "string" &&
          acq.independentCustomerRef.trim() &&
          acq.independentCustomerRef === out.independentCustomerRef,
      );

      const unknowns = buildUnknowns(
        acq,
        out,
        causationKnown,
        independenceKnown,
      );

      joined.push({
        acquisitionId: acq.id,
        usefulOutputId: out.id,
        compatibilityKeys: result.keys,
        sharedEvidenceId,
        causationKnown,
        customerIndependenceKnown: independenceKnown,
        unknowns,
        acquisition: summarizeAcquisition(acq),
        usefulOutput: summarizeOutput(out),
        claims: {
          conversionFromClick: false,
          revenueFromListPrice: false,
          buyerIntentFromActivation: false,
          causationProven: causationKnown,
          customerIndependenceProven: independenceKnown,
        },
      });
    }
  }

  const actCount = activationCount(doc.acquisitionEvidence);
  const actionable = actionableUsefulOutputs(doc.usefulOutputEvidence);
  const usefulCount = actionable.length;

  const base = {
    schema: DIAGNOSIS_SCHEMA,
    generatedAt: new Date(clock()).toISOString(),
    cite: doc.cite,
    joined,
    unjoined,
    missingInputs: [],
    privacyNotes: privacyNotes(),
    truthNotes: truthNotes(),
    mutationBoundary: mutationBoundary(),
    evidenceIndex: "evidence/INDEX.md",
    grexalS149: {
      listingStatus: GREXAL_S149.listingStatus,
      agentId: GREXAL_S149.agentId,
      pricingRunCompletedUsd: GREXAL_S149.pricingRunCompletedUsd,
      estimateReserveIsCharge: false,
      customerExecutionRevenuePayout: false,
      receiptRef: GREXAL_S149.receiptRef,
      note: "List price ≠ revenue; no customer payout claimed",
    },
    summary: {
      acquisitionEvents: doc.acquisitionEvidence.length,
      usefulOutputEvents: doc.usefulOutputEvidence.length,
      joinedCount: joined.length,
      unjoinedCount: unjoined.length,
      causationKnownCount: joined.filter((j) => j.causationKnown).length,
      independenceKnownCount: joined.filter((j) => j.customerIndependenceKnown)
        .length,
    },
  };

  // no_users: capture ok, zero activations OR zero useful (actionable) outputs
  if (actCount === 0 || usefulCount === 0) {
    return {
      ...base,
      status: DIAGNOSIS_STATUS.NO_USERS,
      code: ERROR_CODES.NO_USERS,
      label: "capture_succeeded_zero_activations_or_useful_outputs",
      reason:
        doc.reason ||
        (actCount === 0 && usefulCount === 0
          ? "capture succeeded; zero activations and zero useful outputs"
          : actCount === 0
            ? "capture succeeded; zero link activations"
            : "capture succeeded; zero actionable useful outputs (install/run/observed-earnings)"),
      activationCount: actCount,
      usefulOutputActionableCount: usefulCount,
    };
  }

  if (joined.length === 0) {
    // Capture ok with evidence present, but nothing source-compatible
    return {
      ...base,
      status: DIAGNOSIS_STATUS.AVAILABLE,
      label: "capture_ok_no_compatible_joins",
      reason:
        doc.reason ||
        "capture succeeded; acquisition and useful-output evidence present but no source-compatible pairs",
      activationCount: actCount,
      usefulOutputActionableCount: usefulCount,
    };
  }

  return {
    ...base,
    status: DIAGNOSIS_STATUS.AVAILABLE,
    label: "source_compatible_joins_diagnosed",
    reason:
      doc.reason ||
      "source-compatible joins produced; causation/independence unknowns listed per pair",
    activationCount: actCount,
    usefulOutputActionableCount: usefulCount,
  };
}

/** Guard: unavailable and no_users must remain distinct. */
export function assertCaptureDistinct(unavailableDiag, noUsersDiag) {
  if (!unavailableDiag || unavailableDiag.status !== DIAGNOSIS_STATUS.UNAVAILABLE) {
    throw diagnosisError(ERROR_CODES.INVALID_INPUT, "expected unavailable status");
  }
  if (Object.prototype.hasOwnProperty.call(unavailableDiag, "activationCount")) {
    throw diagnosisError(
      ERROR_CODES.INVALID_INPUT,
      "unavailable must not report activationCount (would collapse into no_users)",
    );
  }
  if (
    Object.prototype.hasOwnProperty.call(unavailableDiag, "usefulOutputActionableCount")
  ) {
    throw diagnosisError(
      ERROR_CODES.INVALID_INPUT,
      "unavailable must not report usefulOutputActionableCount (would collapse into no_users)",
    );
  }
  if (!noUsersDiag || noUsersDiag.status !== DIAGNOSIS_STATUS.NO_USERS) {
    throw diagnosisError(ERROR_CODES.INVALID_INPUT, "expected no_users status");
  }
  if (unavailableDiag.status === noUsersDiag.status) {
    throw diagnosisError(ERROR_CODES.INVALID_INPUT, "capture statuses collapsed");
  }
  if (unavailableDiag.code === noUsersDiag.code) {
    throw diagnosisError(ERROR_CODES.INVALID_INPUT, "capture codes collapsed");
  }
  return true;
}

/** Guard: joined pairs must not claim conversion from clicks or revenue from list price. */
export function assertNoInventedConversion(diagnosis) {
  if (!diagnosis || !Array.isArray(diagnosis.joined)) {
    throw diagnosisError(ERROR_CODES.INVALID_INPUT, "expected diagnosis.joined");
  }
  for (const j of diagnosis.joined) {
    if (j.claims?.conversionFromClick === true) {
      throw diagnosisError(
        ERROR_CODES.FORBIDDEN_INTENT,
        "conversionFromClick forbidden",
      );
    }
    if (j.claims?.revenueFromListPrice === true) {
      throw diagnosisError(
        ERROR_CODES.FORBIDDEN_SYNTHETIC_REVENUE,
        "revenueFromListPrice forbidden",
      );
    }
    if (j.claims?.buyerIntentFromActivation === true) {
      throw diagnosisError(
        ERROR_CODES.FORBIDDEN_INTENT,
        "buyerIntentFromActivation forbidden",
      );
    }
    if (j.causationKnown === true && !j.sharedEvidenceId) {
      throw diagnosisError(
        ERROR_CODES.INVALID_INPUT,
        "causationKnown without sharedEvidenceId",
      );
    }
  }
  return true;
}

/** Guard: causation/independence unknown by default when no shared ids. */
export function assertUnknownsDefault(diagnosis) {
  if (!diagnosis || !Array.isArray(diagnosis.joined)) {
    throw diagnosisError(ERROR_CODES.INVALID_INPUT, "expected diagnosis.joined");
  }
  for (const j of diagnosis.joined) {
    if (!j.sharedEvidenceId && j.causationKnown !== false) {
      throw diagnosisError(
        ERROR_CODES.INVALID_INPUT,
        "causationKnown must default false without sharedEvidenceId",
      );
    }
    if (
      !j.acquisition?.independentCustomerRef &&
      j.customerIndependenceKnown !== false
    ) {
      // independence requires matching refs; without them must be false
      if (j.customerIndependenceKnown !== false) {
        throw diagnosisError(
          ERROR_CODES.INVALID_INPUT,
          "customerIndependenceKnown must default false",
        );
      }
    }
    if (!Array.isArray(j.unknowns) || j.unknowns.length === 0) {
      throw diagnosisError(
        ERROR_CODES.INVALID_INPUT,
        "joined pair must list unknowns[]",
      );
    }
    const text = j.unknowns.join(" ");
    if (!j.causationKnown && !/causation/i.test(text)) {
      throw diagnosisError(
        ERROR_CODES.INVALID_INPUT,
        "unknowns must mention causation when unknown",
      );
    }
  }
  return true;
}
