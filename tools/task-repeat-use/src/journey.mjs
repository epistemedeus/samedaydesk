import { performance } from "node:perf_hooks";
import { bindUsefulDecision, digestPublicInput, disallowedText, readManifest, rejectingPrivate, selectUseful } from "../../result-reuse/src/export.mjs";
import { exportPortableDecision, importPortableDecision } from "../../result-reuse/src/portable.mjs";
import { INSTALLED_MERCHANT, JOURNEY_SCHEMA } from "./pins.mjs";
import { loadCoverage } from "./coverage.mjs";

const ATOMIC = /^(0|[1-9][0-9]{0,18})$/;
const TERMS_DIGEST = /^sha256:[a-f0-9]{64}$/;
const ACTOR = /^[a-z0-9-]{1,64}$/;

function done(body) {
  return {
    schema: JOURNEY_SCHEMA,
    seam: "demonstrated",
    accountCreated: false,
    debtCreated: false,
    charged: false,
    newPrice: false,
    newLedger: false,
    outsideUse: false,
    paymentEvidence: "none",
    merchantCalled: false,
    ...body,
  };
}

function broken(code, message, extra = {}) {
  return done({ ok: false, seam: "broken", code, message, ...extra });
}

function echoTerms(input) {
  if (!input || typeof input !== "object") {
    return { ok: false, code: "original_terms_required", message: "original terms digest is required" };
  }
  if (input.rewriteTerms === true || input.replacementTermsDigest != null) {
    return { ok: false, code: "terms_unchanged_required", message: "original terms stay unchanged" };
  }
  if (input.replacementEarnedDebtAtomic != null) {
    return { ok: false, code: "earned_debt_unchanged_required", message: "earned debt stays unchanged" };
  }
  if (typeof input.termsDigest !== "string" || !TERMS_DIGEST.test(input.termsDigest)) {
    return { ok: false, code: "original_terms_required", message: "original terms digest is required and is not rewritten" };
  }
  const debt = input.earnedDebtAtomic;
  if (debt != null && (typeof debt !== "string" || !ATOMIC.test(debt))) {
    return { ok: false, code: "earned_debt_unchanged_required", message: "earned debt echo must be an atomic decimal string or omitted" };
  }
  return {
    ok: true,
    terms: { termsDigest: input.termsDigest, earnedDebtAtomic: debt ?? null, changed: false },
  };
}

function admitIdentity(identity) {
  if (identity == null) return { ok: true, attached: false, accountCreated: false, signup: false };
  if (typeof identity !== "object" || typeof identity.label !== "string" || !ACTOR.test(identity.label)) {
    return { ok: false, code: "identity_refused", message: "optional identity must be a short public label or omitted" };
  }
  return { ok: true, attached: true, label: identity.label, accountCreated: false, signup: false };
}

function admitActors(producer, consumer) {
  if (!producer || !consumer) return { ok: false, code: "actor_required", message: "producer and consumer actors are required" };
  if (typeof producer.actorId !== "string" || !ACTOR.test(producer.actorId)) {
    return { ok: false, code: "actor_required", message: "producer actor id is required" };
  }
  if (typeof consumer.actorId !== "string" || !ACTOR.test(consumer.actorId)) {
    return { ok: false, code: "actor_required", message: "consumer actor id is required" };
  }
  const distinct = producer.actorId !== consumer.actorId
    && producer.party === "first_party_owner"
    && consumer.party === "later_distinct_agent";
  return { ok: true, distinct, independentReuse: distinct };
}

function paidChoice(request, { distinct, fitting }) {
  const choice = request ?? {};
  if (choice.price != null || choice.quote != null || choice.newPrice === true) {
    return {
      eligible: false,
      taken: false,
      charged: false,
      newPrice: false,
      refused: "new_price_refused",
      authority: null,
      merchant: INSTALLED_MERCHANT.id,
      railway: INSTALLED_MERCHANT.railway,
      paidMpp: INSTALLED_MERCHANT.paidMpp,
      changesOriginalTerms: false,
      debtCreated: false,
    };
  }
  const eligible = distinct && fitting && choice.show === true;
  return {
    eligible,
    taken: false,
    charged: false,
    newPrice: false,
    refused: null,
    authority: eligible ? "existing_x402_on_installed_merchant" : null,
    merchant: INSTALLED_MERCHANT.id,
    railway: INSTALLED_MERCHANT.railway,
    paidMpp: INSTALLED_MERCHANT.paidMpp,
    existingRailUntouched: true,
    changesOriginalTerms: false,
    debtCreated: false,
    note: eligible
      ? "A later distinct task may use the already installed x402 rail. This path does not quote, capture, or settle."
      : "The installed x402 rail stays untouched. This result is not a reason to pay.",
  };
}

function effortReport({ reuseProducerCalls, direct, reuseDigest, directDigest, reuseMs }) {
  let quality = "not_compared";
  if (reuseDigest && directDigest) quality = reuseDigest === directDigest ? "same_approved_body" : "different_body";
  else if (reuseDigest && !direct) quality = "approved_body_without_direct_run";
  else if (!reuseDigest && direct) quality = "reuse_does_not_answer";
  const directCalls = direct?.producerCalls ?? 0;
  const same = quality === "same_approved_body";
  return {
    basis: "producer_invocations",
    reuseProducerCalls,
    directProducerCalls: directCalls,
    quality,
    reuseCheaperOnProducerCalls: same && reuseProducerCalls < directCalls,
    money: "costs_unknown",
    wallClockSampleMs: {
      reuse: reuseMs ?? null,
      direct: direct?.elapsedMs ?? null,
      claim: "single_sample_not_an_economic_advantage",
    },
    signup: false,
    charged: false,
  };
}

function safeMessage(error) {
  const message = error instanceof Error ? error.message : "direct execution failed";
  if (message.includes("/tmp/") || message.includes("/home/") || message.includes("/Users/") || message.includes("/var/")) {
    return "direct execution failed";
  }
  return message.slice(0, 200);
}

async function runDirect(produce, directInput, manifest, { aglSupported }) {
  if (typeof produce !== "function") {
    return { available: false, honest: true, path: "producer_not_supplied", producerCalls: 0, aglSupported };
  }
  const started = performance.now();
  let produced;
  try {
    produced = await produce(directInput);
  } catch (error) {
    return {
      available: true,
      honest: true,
      path: "competent_direct_execution",
      aglSupported,
      producerCalls: 1,
      elapsedMs: performance.now() - started,
      directCompleted: false,
      outcome: "error",
      message: safeMessage(error),
    };
  }
  const elapsedMs = performance.now() - started;
  if (!aglSupported) {
    return {
      available: true,
      honest: true,
      path: "competent_direct_execution",
      aglSupported: false,
      producerCalls: 1,
      elapsedMs,
      directCompleted: produced?.ok === true,
      outcome: produced?.outcome ?? null,
    };
  }
  const useful = selectUseful(produced, manifest);
  return {
    available: true,
    honest: true,
    path: "competent_direct_execution",
    aglSupported: true,
    producerCalls: 1,
    elapsedMs,
    directCompleted: produced?.ok === true,
    outcome: produced?.outcome ?? null,
    usefulOk: useful.ok === true,
    usefulDigest: useful.ok ? digestPublicInput(useful.useful) : null,
  };
}

/**
 * Ordinary path for a later distinct agent.
 * Imports the merged AGL result-reuse surface. Does not copy it, enroll it,
 * quote a new price, or write a ledger.
 */
export async function walkRepeatUse(input = {}) {
  const coverage = input.coverage ?? loadCoverage();
  if (!coverage.ok) return broken("coverage_unreceived", coverage.problems?.join("; ") || "coverage unreceived", { coverage });

  const terms = echoTerms(input.originalTerms);
  if (!terms.ok) return done({ ok: false, code: terms.code, message: terms.message, coverage: { agl: coverage.agl.id, merchant: coverage.merchant.id } });

  const identity = admitIdentity(input.identity);
  if (!identity.ok) return done({ ok: false, code: identity.code, message: identity.message, originalTerms: terms.terms });

  const task = input.task;
  if (!task || task.class !== "already_public") {
    return done({ ok: false, code: "task_not_public", message: "the walletless task must already be a public artifact", originalTerms: terms.terms, identity });
  }
  if (task.signup === true) {
    return done({
      ok: false,
      code: "signup_refused_already_public",
      message: "already-public artifacts do not require signup",
      signup: false,
      identity,
      originalTerms: terms.terms,
      retained: false,
    });
  }
  if (!coverage.existingRails.publicAcceptedWorkGet) {
    return broken("public_read_missing", "accepted-work public read is not available", { originalTerms: terms.terms });
  }

  const actors = admitActors(input.producer, input.consumer);
  if (!actors.ok) return done({ ok: false, code: actors.code, message: actors.message, originalTerms: terms.terms, identity });

  const manifest = input.manifest;
  const supported = readManifest(manifest);
  if (!supported.ok) {
    return done({ ok: false, code: "input_not_before_work", message: supported.message, originalTerms: terms.terms, identity });
  }
  if (!input.produced) {
    return done({ ok: false, code: "retained_output_required", message: "the useful walletless task must already have a produced result to retain", originalTerms: terms.terms, identity });
  }

  const bound = bindUsefulDecision(manifest, input.produced, {
    taskId: task.taskId,
    subject: task.subject,
    sequence: task.sequence ?? 1,
    clock: input.clock,
    optIn: true,
  });
  if (!bound.ok) {
    return done({ ok: false, code: "retain_refused", message: bound.message, originalTerms: terms.terms, identity });
  }
  const approvedDigest = bound.observation?.payload?.decisionBinding?.usefulBodyDigest ?? null;

  const permission = input.permission ?? {};
  const granted = permission.optIn === true && permission.withdrawn !== true;
  if (!granted) {
    const direct = await runDirect(input.produce, input.directInput, manifest, { aglSupported: true });
    return done({
      ok: true,
      fitting: false,
      independentReuse: false,
      reason: permission.withdrawn === true ? "permission_withdrawn" : "permission_absent",
      identity,
      retained: true,
      approvedDigest,
      portable: false,
      ownerRead: !actors.distinct,
      directAlternative: direct,
      paidChoice: paidChoice(input.paidChoice, { distinct: actors.distinct, fitting: false }),
      originalTerms: terms.terms,
      effort: effortReport({ reuseProducerCalls: 0, direct, reuseDigest: null, directDigest: direct.usefulDigest, reuseMs: null }),
      coverage: summarizeCoverage(coverage),
    });
  }

  const exported = exportPortableDecision(bound.observation, manifest, { optIn: true, createdAt: input.clock });
  if (!exported.ok) {
    return done({ ok: false, code: "permission_export_refused", message: exported.message, originalTerms: terms.terms, identity, approvedDigest });
  }

  if (!actors.distinct) {
    return done({
      ok: true,
      fitting: false,
      independentReuse: false,
      reason: "first_party_owner_control",
      identity,
      retained: true,
      approvedDigest,
      portable: true,
      ownerRead: true,
      directAlternative: {
        available: true,
        honest: true,
        path: "owner_read_is_not_reuse",
        producerCalls: 0,
        note: "The producing owner can read the retained output. That read is not an independent later consumer.",
      },
      paidChoice: paidChoice(input.paidChoice, { distinct: false, fitting: false }),
      originalTerms: terms.terms,
      effort: effortReport({ reuseProducerCalls: 0, direct: null, reuseDigest: approvedDigest, directDigest: null, reuseMs: null }),
      coverage: summarizeCoverage(coverage),
    });
  }

  const next = input.newTask ?? {};
  const nextManifest = next.manifest ?? manifest;
  if (rejectingPrivate(nextManifest) || disallowedText(nextManifest)) {
    return done({
      ok: true,
      fitting: false,
      independentReuse: false,
      reason: "private_field",
      identity,
      retained: true,
      approvedDigest,
      portable: true,
      directAlternative: { available: false, honest: true, path: "refused", reason: "private_field", producerCalls: 0 },
      paidChoice: paidChoice(input.paidChoice, { distinct: true, fitting: false }),
      originalTerms: terms.terms,
      effort: effortReport({ reuseProducerCalls: 0, direct: { producerCalls: 0 }, reuseDigest: null, directDigest: null, reuseMs: null }),
      coverage: summarizeCoverage(coverage),
    });
  }

  const nextSupported = readManifest(nextManifest);
  if (!nextSupported.ok) {
    const direct = await runDirect(input.produce, next.directInput, nextManifest, { aglSupported: false });
    return done({
      ok: true,
      fitting: false,
      independentReuse: false,
      reason: "input_not_before_work",
      message: nextSupported.message,
      identity,
      retained: true,
      approvedDigest,
      portable: true,
      directAlternative: direct,
      paidChoice: paidChoice(input.paidChoice, { distinct: true, fitting: false }),
      originalTerms: terms.terms,
      effort: effortReport({ reuseProducerCalls: 0, direct, reuseDigest: null, directDigest: null, reuseMs: null }),
      coverage: summarizeCoverage(coverage),
    });
  }

  const started = performance.now();
  const imported = importPortableDecision(exported.portable, nextManifest, { clock: input.clock });
  const reuseMs = performance.now() - started;
  const reuseHit = imported.ok === true && imported.verdict === "reuse" && imported.producerInvoked === false;
  const reuseDigest = reuseHit ? digestPublicInput(imported.decision) : null;

  let direct = null;
  if (input.compareDirect === true || !reuseHit) {
    direct = await runDirect(input.produce, next.directInput ?? input.directInput, nextManifest, { aglSupported: true });
  }

  if (reuseHit && reuseDigest !== approvedDigest) {
    return broken("quality_diverged", "reused body does not match the retained approved body", { originalTerms: terms.terms, approvedDigest, reusedDigest: reuseDigest });
  }
  if (reuseHit && direct && direct.usefulDigest !== reuseDigest) {
    return broken("quality_diverged", "competent direct execution did not match the reused approved body", {
      originalTerms: terms.terms,
      approvedDigest,
      reusedDigest: reuseDigest,
      directDigest: direct.usefulDigest ?? null,
    });
  }
  return done({
    ok: true,
    fitting: reuseHit,
    independentReuse: reuseHit,
    reason: reuseHit ? "approved_contribution_reused" : (imported.reason || "recompute"),
    identity,
    retained: true,
    approvedDigest,
    reusedDigest: reuseDigest,
    portable: true,
    rights: exported.portable?.rights?.license ?? null,
    producerInvoked: false,
    directAlternative: reuseHit
      ? { available: true, honest: true, path: "competent_direct_execution", taken: input.compareDirect === true, ...directSummary(direct) }
      : direct,
    paidChoice: paidChoice(input.paidChoice, { distinct: true, fitting: reuseHit }),
    originalTerms: terms.terms,
    effort: effortReport({
      reuseProducerCalls: 0,
      direct,
      reuseDigest,
      directDigest: direct?.usefulDigest ?? null,
      reuseMs,
    }),
    qualitySame: reuseHit ? (direct ? direct.usefulDigest === reuseDigest : null) : false,
    coverage: summarizeCoverage(coverage),
  });
}

function directSummary(direct) {
  if (!direct) return { producerCalls: 0 };
  return {
    producerCalls: direct.producerCalls,
    outcome: direct.outcome ?? null,
    usefulDigest: direct.usefulDigest ?? null,
  };
}

function summarizeCoverage(coverage) {
  return {
    agl: coverage.agl.id,
    aglInstalledAtReceiving: coverage.agl.installedAtThatReceiving,
    merchant: coverage.merchant.id,
    railway: coverage.merchant.railway,
    merchantCalled: coverage.merchant.called,
    paidMpp: coverage.merchant.paidMpp,
  };
}
