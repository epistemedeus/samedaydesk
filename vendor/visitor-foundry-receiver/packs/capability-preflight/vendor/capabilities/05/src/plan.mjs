import {
  DEFAULT_RETRY_BOUNDS,
  DRY_RUN_NOTE,
  ERROR_CODES,
  FAILURE_CLASS,
  FREE_ALTERNATIVE_STATE,
  MUTATION_BOUNDARY,
  MUTATION_STATE,
  PLAN_STATUS,
  PLAN_STEP_KIND,
  PREFLIGHT_NOT_REUSED_NOTE,
  SCHEMA,
} from "./constants.mjs";
import {
  assertNoForbidden,
  collectMissingInputs,
  isPlainObject,
  planError,
  validateFailureOutcome,
} from "./validate.mjs";

function step(kind, rationale, extra = {}) {
  const out = { kind, rationale, dryRun: true, liveExecution: false, paidCalls: false };
  for (const [k, v] of Object.entries(extra)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

/**
 * Build mutationPreservation block. Ambiguous state must NEVER claim
 * rolled_back:true or sideEffectsClean:true.
 */
export function buildMutationPreservation(mutationState) {
  if (mutationState !== MUTATION_STATE.AMBIGUOUS) {
    return {
      mutationState,
      preserveAmbiguity: false,
      rolled_back: false,
      sideEffectsClean: mutationState === MUTATION_STATE.NONE ? true : false,
      note:
        mutationState === MUTATION_STATE.NONE
          ? "No mutation observed; no rollback claim required."
          : "Mutation side effects are known from observedState; still dry-run only — no live rollback executed.",
    };
  }
  return {
    mutationState: MUTATION_STATE.AMBIGUOUS,
    preserveAmbiguity: true,
    rolled_back: false,
    sideEffectsClean: false,
    note:
      "Ambiguous mutation state preserved. Do not assume rollback succeeded or that side effects are clean.",
  };
}

function maybeFreeBaselineStep(input) {
  if (input.freeAlternativeState !== FREE_ALTERNATIVE_STATE.EQUIVALENT) {
    return null;
  }
  const label =
    input.freeAlternativeLabel ||
    input.freeAlternativeId ||
    "caller-supplied free baseline";
  return step(
    PLAN_STEP_KIND.USE_FREE_BASELINE,
    `Use already-compared free baseline (${label}); do not invent a new provider brand.`,
    {
      freeAlternativeState: input.freeAlternativeState,
      freeAlternativeId: input.freeAlternativeId,
      freeAlternativeLabel: input.freeAlternativeLabel,
      providerNeutral: true,
    },
  );
}

/**
 * Provider-neutral step sequence from failureClass + mutationState.
 * Never invents a paid provider switch.
 */
export function buildPlanSteps(input) {
  const steps = [];
  const ambiguous = input.mutationState === MUTATION_STATE.AMBIGUOUS;
  const freeStep = maybeFreeBaselineStep(input);

  if (ambiguous) {
    steps.push(
      step(
        PLAN_STEP_KIND.HUMAN_REVIEW,
        "Mutation state is ambiguous; human review before any retry. Preserve ambiguity — do not claim rollback or clean side effects.",
        { requiresHuman: true, preserveAmbiguity: true },
      ),
    );
    if (freeStep) steps.push(freeStep);
    // Bounded same-contract retry only as an explicit later option with ambiguity flag.
    if (
      input.failureClass === FAILURE_CLASS.TIMEOUT ||
      input.failureClass === FAILURE_CLASS.DEPENDENCY_UNAVAILABLE
    ) {
      steps.push(
        step(
          PLAN_STEP_KIND.RETRY_BOUNDED,
          "Optional bounded retry with the same contract only after human review confirms it is safe despite ambiguous mutation.",
          {
            bounds: { ...DEFAULT_RETRY_BOUNDS },
            sameContract: true,
            preserveAmbiguity: true,
            providerNeutral: true,
          },
        ),
      );
    }
    steps.push(
      step(PLAN_STEP_KIND.STOP, "Stop without inventing a provider brand or claiming clean rollback.", {
        terminal: true,
        preserveAmbiguity: true,
      }),
    );
    return steps;
  }

  switch (input.failureClass) {
    case FAILURE_CLASS.TIMEOUT:
      steps.push(
        step(
          PLAN_STEP_KIND.RETRY_BOUNDED,
          "Bounded retry with the same contract after timeout; no provider switch.",
          { bounds: { ...DEFAULT_RETRY_BOUNDS }, sameContract: true, providerNeutral: true },
        ),
      );
      steps.push(
        step(
          PLAN_STEP_KIND.REDUCE_SCOPE,
          "If retry still times out, reduce scope of the same contract (smaller batch / narrower inputs).",
          { providerNeutral: true },
        ),
      );
      if (freeStep) steps.push(freeStep);
      steps.push(step(PLAN_STEP_KIND.STOP, "Stop after bounded retries; do not invent a paid provider fix.", { terminal: true }));
      break;

    case FAILURE_CLASS.VALIDATION:
      steps.push(
        step(
          PLAN_STEP_KIND.REDUCE_SCOPE,
          "Validation failure: correct or narrow inputs against the same contract; do not blind-retry unchanged payload.",
          { providerNeutral: true },
        ),
      );
      steps.push(
        step(PLAN_STEP_KIND.HUMAN_REVIEW, "Human review of validation error vs contract constraints.", {
          requiresHuman: true,
        }),
      );
      if (freeStep) steps.push(freeStep);
      steps.push(step(PLAN_STEP_KIND.STOP, "Stop without inventing a provider brand.", { terminal: true }));
      break;

    case FAILURE_CLASS.AUTH:
      steps.push(
        step(
          PLAN_STEP_KIND.HUMAN_REVIEW,
          "Auth failure requires human review of credentials/grants; planner does not invent secrets or provider switches.",
          { requiresHuman: true },
        ),
      );
      steps.push(step(PLAN_STEP_KIND.STOP, "Stop; do not attempt live auth repair from this dry-run plan.", { terminal: true }));
      break;

    case FAILURE_CLASS.DEPENDENCY_UNAVAILABLE:
      steps.push(
        step(
          PLAN_STEP_KIND.RETRY_BOUNDED,
          "Dependency unavailable: bounded retry with the same contract after a wait; no new provider brand.",
          { bounds: { ...DEFAULT_RETRY_BOUNDS }, sameContract: true, providerNeutral: true },
        ),
      );
      if (freeStep) steps.push(freeStep);
      steps.push(
        step(PLAN_STEP_KIND.HUMAN_REVIEW, "If dependency remains unavailable, escalate for human review.", {
          requiresHuman: true,
        }),
      );
      steps.push(step(PLAN_STEP_KIND.STOP, "Stop without inventing a paid provider fix.", { terminal: true }));
      break;

    case FAILURE_CLASS.PARTIAL_DELIVERY:
      if (input.mutationState === MUTATION_STATE.KNOWN) {
        steps.push(
          step(
            PLAN_STEP_KIND.HUMAN_REVIEW,
            "Partial delivery with known mutation: review observed side effects before further action.",
            { requiresHuman: true },
          ),
        );
        steps.push(
          step(
            PLAN_STEP_KIND.REDUCE_SCOPE,
            "Optionally continue with reduced scope on the same contract after review.",
            { providerNeutral: true },
          ),
        );
      } else {
        steps.push(
          step(
            PLAN_STEP_KIND.REDUCE_SCOPE,
            "Partial delivery with no mutation: reduce scope and re-attempt same contract.",
            { providerNeutral: true },
          ),
        );
        steps.push(
          step(
            PLAN_STEP_KIND.RETRY_BOUNDED,
            "Bounded retry with the same contract after scope reduction.",
            { bounds: { ...DEFAULT_RETRY_BOUNDS }, sameContract: true, providerNeutral: true },
          ),
        );
      }
      if (freeStep) steps.push(freeStep);
      steps.push(step(PLAN_STEP_KIND.STOP, "Stop without inventing a provider brand.", { terminal: true }));
      break;

    case FAILURE_CLASS.UNKNOWN:
    default:
      steps.push(
        step(PLAN_STEP_KIND.HUMAN_REVIEW, "Unknown failure class: escalate for human classification before retry.", {
          requiresHuman: true,
        }),
      );
      if (freeStep) steps.push(freeStep);
      steps.push(step(PLAN_STEP_KIND.STOP, "Stop; do not invent a provider brand as the fix.", { terminal: true }));
      break;
  }

  return steps;
}

function rejectedEnvelope(rawInput, clock, error, missingInputs) {
  const capabilityId =
    isPlainObject(rawInput) && typeof rawInput.capabilityId === "string" && rawInput.capabilityId.trim()
      ? rawInput.capabilityId.trim()
      : null;
  const attemptId =
    isPlainObject(rawInput) && typeof rawInput.attemptId === "string" && rawInput.attemptId.trim()
      ? rawInput.attemptId.trim()
      : null;
  return {
    schema: SCHEMA,
    capabilityId,
    attemptId,
    generatedAt: new Date(clock()).toISOString(),
    status: PLAN_STATUS.REJECTED,
    failureClass: null,
    mutationState: null,
    steps: [],
    missingInputs: missingInputs || [],
    error: {
      code: error.code || ERROR_CODES.INVALID_INPUT,
      message: error.message,
      details: error.details ?? null,
    },
    dryRun: true,
    paidCalls: false,
    liveExecution: false,
    dryRunNote: DRY_RUN_NOTE,
    mutationBoundary: MUTATION_BOUNDARY,
    preflightNotReused: PREFLIGHT_NOT_REUSED_NOTE,
    providerNeutral: true,
  };
}

function partialEnvelope(rawInput, clock, missingInputs, softError) {
  const capabilityId =
    typeof rawInput.capabilityId === "string" && rawInput.capabilityId.trim()
      ? rawInput.capabilityId.trim()
      : null;
  const attemptId =
    typeof rawInput.attemptId === "string" && rawInput.attemptId.trim()
      ? rawInput.attemptId.trim()
      : null;
  const hasIdentity = Boolean(capabilityId && attemptId);
  return {
    schema: SCHEMA,
    capabilityId,
    attemptId,
    generatedAt: new Date(clock()).toISOString(),
    status: hasIdentity ? PLAN_STATUS.PARTIAL_INPUT : PLAN_STATUS.REJECTED,
    failureClass:
      typeof rawInput.failureClass === "string" && rawInput.failureClass.trim()
        ? rawInput.failureClass.trim().toLowerCase()
        : null,
    mutationState:
      typeof rawInput.mutationState === "string" && rawInput.mutationState.trim()
        ? rawInput.mutationState.trim().toLowerCase()
        : null,
    observedState: rawInput.observedState ?? null,
    steps: [],
    missingInputs,
    error: softError
      ? { code: softError.code, message: softError.message, details: softError.details ?? null }
      : null,
    dryRun: true,
    paidCalls: false,
    liveExecution: false,
    dryRunNote: DRY_RUN_NOTE,
    mutationBoundary: MUTATION_BOUNDARY,
    preflightNotReused: PREFLIGHT_NOT_REUSED_NOTE,
    providerNeutral: true,
    demo: rawInput.demo === true,
  };
}

/**
 * Build a bounded provider-neutral failure fallback plan.
 * Dry-run only. Ambiguous mutationState always emits mutationPreservation
 * with rolled_back:false and sideEffectsClean:false.
 */
export function buildFailureFallbackPlan(rawInput, { clock = () => Date.now() } = {}) {
  if (!isPlainObject(rawInput)) {
    return rejectedEnvelope(rawInput, clock, planError(ERROR_CODES.INVALID_INPUT, "failure outcome must be an object"), [
      {
        id: "failure_outcome",
        name: "Failed capability outcome record",
        kind: "object",
        required: true,
        source: "caller",
      },
    ]);
  }

  try {
    assertNoForbidden(rawInput, "input");
  } catch (err) {
    return rejectedEnvelope(rawInput, clock, err, []);
  }

  const missing = collectMissingInputs(rawInput);
  if (missing.length > 0) {
    return partialEnvelope(rawInput, clock, missing, {
      code: ERROR_CODES.MISSING_REQUIREMENT,
      message: `missing required fields: ${missing.map((m) => m.id).join(",")}`,
      details: { missingInputs: missing },
    });
  }

  let input;
  try {
    input = validateFailureOutcome(rawInput);
  } catch (err) {
    if (err && err.code === ERROR_CODES.FORBIDDEN_CLAIM) {
      return rejectedEnvelope(rawInput, clock, err, []);
    }
    if (err && err.code === ERROR_CODES.MISSING_REQUIREMENT) {
      const miss = err.details?.missingInputs || collectMissingInputs(rawInput);
      return partialEnvelope(rawInput, clock, miss, err);
    }
    if (err && err.code === ERROR_CODES.INVALID_INPUT) {
      return rejectedEnvelope(rawInput, clock, err, []);
    }
    throw err;
  }

  const steps = buildPlanSteps(input);
  const mutationPreservation = buildMutationPreservation(input.mutationState);

  if (input.mutationState === MUTATION_STATE.AMBIGUOUS) {
    if (mutationPreservation.rolled_back === true) {
      throw planError(ERROR_CODES.FORBIDDEN_CLAIM, "ambiguous mutation must not claim rolled_back:true");
    }
    if (mutationPreservation.sideEffectsClean === true) {
      throw planError(ERROR_CODES.FORBIDDEN_CLAIM, "ambiguous mutation must not claim sideEffectsClean:true");
    }
    if (mutationPreservation.preserveAmbiguity !== true) {
      throw planError(ERROR_CODES.INVALID_INPUT, "ambiguous mutation must preserveAmbiguity:true");
    }
  }

  const out = {
    schema: SCHEMA,
    capabilityId: input.capabilityId,
    attemptId: input.attemptId,
    generatedAt: new Date(clock()).toISOString(),
    status: PLAN_STATUS.READY,
    failureClass: input.failureClass,
    mutationState: input.mutationState,
    observedState: input.observedState,
    errorCode: input.errorCode,
    notes: input.notes,
    steps,
    mutationPreservation,
    missingInputs: [],
    dryRun: true,
    paidCalls: false,
    liveExecution: false,
    dryRunNote: DRY_RUN_NOTE,
    mutationBoundary: MUTATION_BOUNDARY,
    preflightNotReused: PREFLIGHT_NOT_REUSED_NOTE,
    providerNeutral: true,
    demo: input.demo === true,
    freeAlternativeState: input.freeAlternativeState,
    consumerInstructions:
      "Supply a failed capability outcome JSON fixture. Run `node src/cli.mjs plan <input.json>`. " +
      "Steps are dry-run only. If mutationState is ambiguous, preserve ambiguity. " +
      "Do not invent a provider brand; optional use_free_baseline only when freeAlternativeState is already supplied.",
  };

  for (const key of [
    "buyerCount",
    "revenue",
    "rankingScore",
    "reputation",
    "escrow",
    "custody",
    "claimAuthority",
    "investAdvice",
    "providerBrand",
    "switchToProvider",
  ]) {
    if (Object.prototype.hasOwnProperty.call(out, key)) {
      throw planError(ERROR_CODES.FORBIDDEN_CLAIM, `${key} must not appear on fallback plan`);
    }
  }

  return out;
}
