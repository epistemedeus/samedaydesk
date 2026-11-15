import { join } from "node:path";
import { produceRecurringResult } from "../../recurring-decision-consumer/src/recurring-result.mjs";
import { digest, readJson, writeJsonAtomic } from "./json.mjs";
import { DIRECT_DECISIONS, DIRECT_PREVIEW, DIRECT_REPEAT_FITTING, DIRECT_REPEAT_NONFITTING, JOURNAL_SCHEMA, PUBLIC_SCHEMA, RECEIPT_SCHEMA, REQUEST_SCHEMA } from "./pins.mjs";
import { readRetained, recoverCapture, retainCapture } from "./retain.mjs";
import { selectExtension } from "./select.mjs";
import { continueWork, termsProblem, workGate } from "./work.mjs";

function publicBody({ request, retained, decisions, extension, work, duplicateEffect }) {
  const rows = Array.isArray(decisions?.decisions)
    ? decisions.decisions.map((item) => ({
        intentId: item.intentId,
        outcome: item.result?.outcome || null,
        reason: item.result?.reason || null,
        useful: item.result?.useful === true,
        changedFields: item.result?.decision?.changedFields || [],
        unchangedFields: item.result?.decision?.unchangedFields || [],
      }))
    : [];
  return {
    schema: PUBLIC_SCHEMA,
    ok: true,
    duplicateEffect,
    capture: {
      captureId: retained.capture.captureId,
      subject: retained.capture.subject,
      capturedAt: retained.capture.capturedAt,
      digest: retained.digest,
      transferred: rows.length === 0 || decisions?.capture?.captureId === retained.capture.captureId,
    },
    decisions: rows,
    decisionOutcome: decisions?.outcome || null,
    extension: {
      need: extension.need,
      selected: extension.selected,
      fitting: extension.fitting === true,
      acquired: extension.acquired === true,
      published: false,
      executionDeclaration: extension.executionDeclaration || null,
      observationDigest: extension.observationDigest || null,
      directObservationMatches: extension.directObservationMatches === true,
      directCommand: extension.directCommand || null,
    },
    work: {
      appropriate: work.appropriate === true,
      reason: work.reason || null,
      taskId: work.taskId || null,
      accepted: work.accepted === true,
      evidenceOutcome: work.evidenceOutcome || null,
      readback: work.readback || null,
      shared: work.shared === true,
      proof: work.proofPublic || null,
      rewardsHidden: true,
    },
    repeatUse: {
      ran: false,
      appropriate: false,
      reason: "the retained capture is a permitted field snapshot; walletless repeat use stays on its existing command",
      directCommand: DIRECT_REPEAT_FITTING,
      nonFittingCommand: DIRECT_REPEAT_NONFITTING,
    },
    directDecisions: DIRECT_DECISIONS,
    originalTermsPreserved: work.appropriate === true ? work.private?.termsPreserved === true : termsProblem(request) == null,
    pricingInvented: false,
    rewardsHidden: true,
    published: false,
    actor: request.actor?.actorId || null,
  };
}

function effectIdOf(request) {
  return digest({
    capture: request.capture,
    clock: request.clock,
    horizonHours: request.horizonHours,
    intents: request.intents,
    priors: request.priors,
    schedule: request.schedule,
    cancel: request.cancel === true,
    extension: request.extension,
    work: request.work,
    originalTerms: request.originalTerms,
    actor: request.actor,
  });
}

function readReceipt(store) {
  return readJson(join(store, "receipt.json"));
}

function recurringInput(request, capture, store) {
  return {
    capture,
    intents: request.intents,
    priors: request.priors,
    schedule: request.schedule,
    clock: request.clock,
    horizonHours: request.horizonHours,
    cancel: request.cancel === true,
    stateDir: join(store, "decisions"),
    ownerQaPriors: request.priors?.ownerQa === true,
  };
}

function persistReceipt(store, request, effectId, body, work = {}) {
  const receipt = {
    schema: RECEIPT_SCHEMA,
    effectId,
    appliedCount: 1,
    public: body,
    private: {
      feeProjection: work.private?.feeProjection || null,
      quote: work.private?.quote || null,
      termsDigest: request.originalTerms?.termsDigest || null,
      rightsDigest: request.originalTerms?.rightsDigest || null,
      earnedDebtAtomic: request.originalTerms?.earnedDebtAtomic || null,
      fencing: work.fencing || null,
      decisionCaptureId: work.decisionCaptureId || null,
    },
  };
  const written = writeJsonAtomic(join(store, "receipt.json"), receipt);
  if (!written.ok) return written;
  const journalRead = readJson(join(store, "journal.json"));
  const effects = journalRead.ok && Array.isArray(journalRead.value.effects) ? journalRead.value.effects : [];
  if (!effects.some((item) => item.id === effectId)) {
    effects.push({ id: effectId, at: request.clock, kind: "deliver" });
  }
  const journaled = writeJsonAtomic(join(store, "journal.json"), { schema: JOURNAL_SCHEMA, effects });
  if (!journaled.ok) return journaled;
  return { ok: true };
}

export function composeDelivery(request, { store } = {}) {
  if (!request || typeof request !== "object" || Array.isArray(request)) {
    return { ok: false, reason: "request_required" };
  }
  if (request.schema !== REQUEST_SCHEMA) return { ok: false, reason: "request_schema_unsupported" };
  if (!store) return { ok: false, reason: "store_required" };
  if (!Array.isArray(request.intents) || request.intents.length < 1) return { ok: false, reason: "intents_required" };
  const effectId = effectIdOf(request);
  const prior = readReceipt(store);
  if (prior.ok && prior.value?.effectId === effectId && prior.value.public) {
    return { ok: true, duplicateEffect: "replay", public: { ...prior.value.public, duplicateEffect: "replay" } };
  }
  if (prior.ok && prior.value?.effectId && prior.value.effectId !== effectId) {
    return { ok: false, reason: "delivery_effect_conflict", message: "this store already completed a different delivery" };
  }
  const retained = retainCapture({
    store,
    capture: request.capture,
    clock: request.clock,
    actor: request.actor,
    replace: false,
  });
  if (!retained.ok && retained.reason === "capture_refused" && request.capture?.schema && request.capture.schema !== "samedaydesk.recurring-decision-permitted-capture.v1") {
    const decisions = produceRecurringResult(recurringInput(request, request.capture, store));
    if (!decisions.ok && decisions.outcome !== "compared") {
      return { ok: false, reason: "decisions_refused", message: decisions.message };
    }
    const unsupported = publicBody({
      request,
      retained: {
        digest: null,
        capture: {
          captureId: request.capture.captureId || null,
          subject: request.capture.subject || null,
          capturedAt: request.capture.capturedAt || null,
        },
      },
      decisions,
      extension: {
        need: request.extension?.need || "observation",
        selected: null,
        fitting: false,
        acquired: false,
        published: false,
        executionDeclaration: "unsupported_execution",
        directCommand: DIRECT_PREVIEW,
      },
      work: { appropriate: false, reason: "capture_schema_unsupported", rewardsHidden: true },
    });
    const savedUnsupported = persistReceipt(store, request, effectId, unsupported, {
      decisionCaptureId: decisions.capture?.captureId || null,
    });
    if (!savedUnsupported.ok) return savedUnsupported;
    return { ok: true, duplicateEffect: "applied", public: unsupported };
  }
  if (!retained.ok) return retained;
  const decisions = produceRecurringResult(recurringInput(request, retained.retained.capture, store));
  if (!decisions.ok && decisions.outcome !== "cancelled" && decisions.reason === "invalid_input") {
    return { ok: false, reason: "decisions_refused", message: decisions.message };
  }
  if (decisions.capture && decisions.capture.captureId !== retained.retained.capture.captureId) {
    return { ok: false, reason: "capture_not_transferred" };
  }
  const extension = selectExtension({ request, capture: retained.retained.capture, store });
  if (extension.ok === false) return extension;
  const gate = workGate({ ...request, _decisions: decisions }, decisions);
  let work;
  if (!gate.appropriate) {
    work = { ok: true, appropriate: false, reason: gate.reason, rewardsHidden: true, shared: false };
  } else {
    work = continueWork({
      request: { ...request, _decisions: decisions },
      capture: retained.retained.capture,
      store,
      effectId,
    });
    if (!work.ok) return work;
  }
  const body = publicBody({
    request,
    retained: retained.retained,
    decisions,
    extension,
    work,
    duplicateEffect: "applied",
  });
  const saved = persistReceipt(store, request, effectId, body, {
    ...work,
    decisionCaptureId: decisions.capture?.captureId || null,
  });
  if (!saved.ok) return saved;
  return { ok: true, duplicateEffect: "applied", public: body };
}

export function showDelivery(store) {
  const receipt = readReceipt(store);
  if (!receipt.ok) return { ok: false, reason: receipt.reason === "missing" ? "delivery_missing" : receipt.reason };
  return { ok: true, public: receipt.value.public };
}

export function recoverDelivery(store, options) {
  const recovered = recoverCapture(store, options);
  if (!recovered.ok) return recovered;
  const retained = readRetained(store);
  return {
    ok: true,
    recovered: recovered.recovered === true,
    source: recovered.source,
    captureId: retained.ok ? retained.value.capture.captureId : null,
    digest: retained.ok ? retained.value.digest : null,
  };
}
