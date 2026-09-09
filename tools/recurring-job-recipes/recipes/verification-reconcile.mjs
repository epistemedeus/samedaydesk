import { readFileSync } from "node:fs";
import { costForRecipe } from "../lib/cost.mjs";
import { sha256Hex, stableStringify } from "../lib/hash.mjs";
import { inspectPaymentAuthority } from "../lib/payment-guard.mjs";
import { loadPrior } from "../lib/prior.mjs";
import { classifyStaleBaseline, recoveryPlan } from "../lib/recovery.mjs";

export const RECIPE_ID = "verification-reconcile";
export const RECIPE_SCHEMA = "samedaydesk.recurring-job-recipe-result.v1";

export const META = Object.freeze({
  recipeId: RECIPE_ID,
  userBenefit:
    "Verify that a later observation still matches the immutable prior, or reconcile partial/error rows without replaying a payment.",
  operatorSupplies: ["priorPath", "candidatePath", "scheduleHint", "clock", "horizonHours"],
  acceptedContracts: [
    "pilot/page-change-brief/v1",
    "samedaydesk.extract-batch.v0",
    "samedaydesk evidence reconcile patterns",
  ],
});

export async function runVerificationReconcile(input = {}) {
  const clock = input.clock || new Date().toISOString();
  const scheduleHint = input.scheduleHint || null;

  const priorLoad = loadPrior(input.priorPath);
  if (!priorLoad.ok) {
    return fail(priorLoad.code, priorLoad.message, { clock, scheduleHint });
  }

  const payment = inspectPaymentAuthority(priorLoad.prior, input);
  if (!payment.ok) {
    return fail(payment.code, payment.message, {
      clock,
      scheduleHint,
      payment,
      prior: summarizePrior(priorLoad),
    });
  }

  const stale = classifyStaleBaseline(priorLoad.prior.createdAt, clock, input.horizonHours);
  if (stale.stale) {
    return result({
      outcome: "stale_baseline",
      clock,
      scheduleHint,
      prior: summarizePrior(priorLoad),
      payment,
      stale,
      evidence: { kind: "stale_baseline", ...stale },
    });
  }

  if (!input.candidatePath) {
    return fail("missing_candidate", "operator must supply --candidate for verification/reconcile", {
      clock,
      scheduleHint,
      prior: summarizePrior(priorLoad),
      payment,
    });
  }

  let candidate;
  try {
    candidate = JSON.parse(readFileSync(input.candidatePath, "utf8"));
  } catch (error) {
    return fail("invalid_candidate", error instanceof Error ? error.message : String(error), {
      clock,
      scheduleHint,
      prior: summarizePrior(priorLoad),
      payment,
    });
  }

  const priorDigest = digestObservation(priorLoad.prior.payload);
  const candidateDigest = digestObservation(candidate);
  const mismatches = [];
  for (const key of new Set([...Object.keys(priorDigest), ...Object.keys(candidateDigest)])) {
    if (stableStringify(priorDigest[key]) !== stableStringify(candidateDigest[key])) {
      mismatches.push({ field: key, before: priorDigest[key] ?? null, after: candidateDigest[key] ?? null });
    }
  }

  const candidateStatus = candidate.status || candidate.jobStatus || candidate.outcome || null;
  const partial =
    candidate.partial === true ||
    candidateStatus === "partial" ||
    (Array.isArray(candidate.sources) &&
      candidate.sources.some((row) => row.status === "failure" || row.status === "partial"));

  const paymentReplayProbe = inspectPaymentAuthority(
    {
      payment: {
        attempted: Boolean(candidate.payment?.attempted || candidate.charged || candidate.authorizationId),
        receiptId: candidate.payment?.receiptId || candidate.receiptId || null,
        authorizationId: candidate.payment?.authorizationId || candidate.authorizationId || null,
        charged: candidate.charged === true,
      },
    },
    { replayPayment: Boolean(input.replayPayment || candidate.autoReplayPayment) },
  );

  if (!paymentReplayProbe.ok) {
    return result({
      outcome: "error",
      clock,
      scheduleHint,
      prior: summarizePrior(priorLoad),
      payment: paymentReplayProbe,
      evidence: {
        kind: "payment_replay_blocked",
        code: paymentReplayProbe.code,
        message: paymentReplayProbe.message,
        candidatePath: input.candidatePath,
      },
    });
  }

  let outcome = "unchanged";
  if (partial) outcome = "partial";
  else if (mismatches.length > 0) outcome = "changed";

  return result({
    outcome,
    clock,
    scheduleHint,
    prior: summarizePrior(priorLoad),
    payment,
    stale,
    evidence: {
      kind: "verification_reconcile",
      candidatePath: input.candidatePath,
      candidateSha256: sha256Hex(stableStringify(candidate)),
      priorDigest,
      candidateDigest,
      mismatches,
      partial,
      claims: {
        noChangeProven: mismatches.length === 0 && !partial,
        comparable: true,
        paymentImpliesUsefulOutput: false,
        automaticPaymentReplay: false,
      },
    },
  });
}

function digestObservation(payload) {
  if (!payload || typeof payload !== "object") return { value: payload ?? null };
  if (payload.contentHash) return { contentHash: payload.contentHash, title: payload.title ?? null };
  if (payload.fields && typeof payload.fields === "object") return { ...payload.fields };
  if (payload.observation?.fields) return { ...payload.observation.fields };
  if (Array.isArray(payload.sources)) {
    return {
      sources: payload.sources.map((row) => ({
        source: row.source || row.sourceKey || row.id || null,
        status: row.status ?? null,
        title: row.data?.title ?? row.title ?? row.fields?.title ?? null,
      })),
    };
  }
  if (payload.report?.snapshot?.before?.sha256 || payload.report?.snapshot?.after?.sha256) {
    return {
      before: payload.report.snapshot.before?.sha256 ?? null,
      after: payload.report.snapshot.after?.sha256 ?? null,
      verdict: payload.report.verdict ?? null,
    };
  }
  if (payload.sha256 && payload.payload) return digestObservation(payload.payload);
  return { fingerprint: sha256Hex(payload) };
}

function summarizePrior(priorLoad) {
  return {
    path: priorLoad.path,
    sha256: priorLoad.prior.sha256,
    sequence: priorLoad.prior.sequence,
    createdAt: priorLoad.prior.createdAt,
    immutable: priorLoad.prior.immutable,
  };
}

function fail(code, message, extra = {}) {
  return result({
    outcome: "error",
    ...extra,
    evidence: { kind: "error", code, message },
  });
}

function result(partial) {
  return {
    ok: partial.outcome === "unchanged" || partial.outcome === "changed" || partial.outcome === "partial",
    schema: RECIPE_SCHEMA,
    recipeId: RECIPE_ID,
    meta: META,
    cost: costForRecipe(RECIPE_ID),
    recovery: recoveryPlan(partial.outcome, partial.evidence),
    ...partial,
  };
}
