import { costForRecipe } from "../lib/cost.mjs";
import { sha256Hex, stableStringify } from "../lib/hash.mjs";
import { inspectPaymentAuthority } from "../lib/payment-guard.mjs";
import { loadPrior } from "../lib/prior.mjs";
import { classifyStaleBaseline, recoveryPlan } from "../lib/recovery.mjs";
import { extractComparableFields, fetchLiveSafe, loadFixtureSource, withRetries } from "../lib/fetch.mjs";

export const RECIPE_ID = "source-change-alert";
export const RECIPE_SCHEMA = "samedaydesk.recurring-job-recipe-result.v1";

export const META = Object.freeze({
  recipeId: RECIPE_ID,
  userBenefit:
    "Know when a watched public page's selected fields change since your immutable prior, without buying a subscription or leaving a daemon running.",
  operatorSupplies: ["priorPath", "scheduleHint", "fields", "clock", "horizonHours", "current fixture or --live-safe"],
  acceptedContracts: ["pilot.task-commons.page-change-result.v1", "pilot/page-change-brief/v1"],
});

export async function runSourceChangeAlert(input = {}) {
  const clock = input.clock || new Date().toISOString();
  const fields = Array.isArray(input.fields) && input.fields.length > 0 ? input.fields : ["title"];
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
      fields,
      prior: summarizePrior(priorLoad),
      payment,
      stale,
      evidence: { kind: "stale_baseline", ...stale },
    });
  }

  const observation = await observeCurrent(input, fields);
  if (!observation.ok) {
    return result({
      outcome: "error",
      clock,
      scheduleHint,
      fields,
      prior: summarizePrior(priorLoad),
      payment,
      evidence: {
        kind: "observe_error",
        attempts: observation.attempts,
        message: observation.error.message,
      },
    });
  }

  const priorFields = pickPriorFields(priorLoad.prior.payload, fields);
  const currentFields = observation.value.fields;
  const changed = [];
  const unchanged = [];
  for (const field of fields) {
    const before = priorFields[field] ?? null;
    const after = currentFields[field] ?? null;
    if (stableStringify(before) === stableStringify(after)) unchanged.push({ field, value: after });
    else changed.push({ field, before, after });
  }

  const outcome = changed.length === 0 ? "unchanged" : "changed";
  return result({
    outcome,
    clock,
    scheduleHint,
    fields,
    prior: summarizePrior(priorLoad),
    payment,
    stale,
    evidence: {
      kind: "field_diff",
      source: observation.value.source,
      contentHash: observation.value.contentHash,
      status: observation.value.status ?? null,
      changed,
      unchanged,
      retriesUsed: observation.retriesUsed,
      attempts: observation.attempts,
    },
  });
}

async function observeCurrent(input, fields) {
  if (input.currentFixturePath) {
    const loaded = loadFixtureSource(input.currentFixturePath);
    if (loaded.kind === "json") {
      const payload = loaded.body;
      const extracted =
        payload.fields && typeof payload.fields === "object"
          ? Object.fromEntries(fields.map((field) => [field, payload.fields[field] ?? payload[field] ?? null]))
          : Object.fromEntries(fields.map((field) => [field, payload[field] ?? null]));
      return {
        ok: true,
        retriesUsed: 0,
        attempts: [{ attempt: 1, ok: true }],
        value: {
          source: { kind: "fixture", path: input.currentFixturePath },
          status: payload.status ?? 200,
          contentHash: payload.contentHash || `sha256:${sha256Hex(loaded.text)}`,
          fields: extracted,
        },
      };
    }
    return {
      ok: true,
      retriesUsed: 0,
      attempts: [{ attempt: 1, ok: true }],
      value: {
        source: { kind: "fixture", path: input.currentFixturePath },
        status: 200,
        contentHash: `sha256:${sha256Hex(loaded.text)}`,
        fields: extractComparableFields(loaded.text, fields),
      },
    };
  }

  if (!input.liveSafe) {
    return {
      ok: false,
      error: new Error("supply --current-fixture or --live-safe"),
      attempts: [],
      retriesUsed: 0,
    };
  }

  const url = input.liveUrl || "https://example.com/";
  const retried = await withRetries(
    async () => {
      const page = await fetchLiveSafe(url, { fetchImpl: input.fetchImpl, timeoutMs: input.timeoutMs });
      if (!page.ok) {
        const err = new Error(`live fetch status ${page.status}`);
        err.retryable = page.status >= 500 || page.status === 429;
        throw err;
      }
      return page;
    },
    {
      retries: input.retries ?? 2,
      delayMs: input.retryDelayMs ?? 0,
      shouldRetry: (error) => error.retryable !== false,
    },
  );

  if (!retried.ok) return retried;
  const page = retried.value;
  return {
    ok: true,
    retriesUsed: retried.retriesUsed,
    attempts: retried.attempts,
    value: {
      source: { kind: "live_safe", url: page.finalUrl || page.url },
      status: page.status,
      contentHash: `sha256:${sha256Hex(page.text)}`,
      fields: extractComparableFields(page.text, fields),
    },
  };
}

function pickPriorFields(payload, fields) {
  if (payload?.fields && typeof payload.fields === "object") {
    return Object.fromEntries(fields.map((field) => [field, payload.fields[field] ?? null]));
  }
  if (payload?.observation?.fields && typeof payload.observation.fields === "object") {
    return Object.fromEntries(fields.map((field) => [field, payload.observation.fields[field] ?? null]));
  }
  return Object.fromEntries(fields.map((field) => [field, payload?.[field] ?? null]));
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
  const recovery = recoveryPlan(partial.outcome, partial.evidence);
  return {
    ok: partial.outcome === "unchanged" || partial.outcome === "changed" || partial.outcome === "partial",
    schema: RECIPE_SCHEMA,
    recipeId: RECIPE_ID,
    meta: META,
    cost: costForRecipe(RECIPE_ID),
    recovery,
    ...partial,
  };
}
