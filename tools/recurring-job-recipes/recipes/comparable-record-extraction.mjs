import { basename } from "node:path";
import { costForRecipe } from "../lib/cost.mjs";
import { sha256Hex, stableStringify } from "../lib/hash.mjs";
import { inspectPaymentAuthority } from "../lib/payment-guard.mjs";
import { loadPrior } from "../lib/prior.mjs";
import { classifyStaleBaseline, recoveryPlan } from "../lib/recovery.mjs";
import { extractComparableFields, fetchLiveSafe, loadFixtureSource, withRetries } from "../lib/fetch.mjs";

export const RECIPE_ID = "comparable-record-extraction";
export const RECIPE_SCHEMA = "samedaydesk.recurring-job-recipe-result.v1";

export const META = Object.freeze({
  recipeId: RECIPE_ID,
  userBenefit:
    "Recurringly extract the same comparable fields from one to five public sources and keep a durable before/after record without inventing completeness.",
  operatorSupplies: ["priorPath", "sources", "fields", "scheduleHint", "clock", "horizonHours"],
  acceptedContracts: ["samedaydesk.extract-batch.v0", "explicit buyer-record mapping"],
});

export async function runComparableRecordExtraction(input = {}) {
  const clock = input.clock || new Date().toISOString();
  const fields = Array.isArray(input.fields) && input.fields.length > 0 ? input.fields : ["title"];
  const scheduleHint = input.scheduleHint || null;
  const sources = normalizeSources(input);
  if (sources.length === 0) {
    return fail("missing_sources", "operator must supply sources (fixture paths and/or live-safe URLs)", {
      clock,
      scheduleHint,
    });
  }
  if (sources.length > 5) {
    return fail("too_many_sources", "comparable extraction is bounded to 1-5 sources per run", {
      clock,
      scheduleHint,
    });
  }

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

  const rows = [];
  for (const source of sources) {
    rows.push(await extractOne(source, fields, input));
  }

  const success = rows.filter((row) => row.status === "success");
  const failed = rows.filter((row) => row.status === "failure");
  const partialRows = rows.filter((row) => row.partial || row.status === "partial");
  const hasPartial = partialRows.length > 0 || (failed.length > 0 && success.length > 0);

  const priorRecords = indexPriorRecords(priorLoad.prior.payload);
  const comparisons = success.map((row) => {
    const before = lookupPrior(priorRecords, row.sourceKey);
    const after = row.fields;
    const changed =
      before == null ? true : stableStringify(before.fields || before) !== stableStringify(after);
    return {
      sourceKey: row.sourceKey,
      changed,
      before: before?.fields || before,
      after,
    };
  });

  let outcome = "unchanged";
  if (failed.length === rows.length) outcome = "error";
  else if (hasPartial) outcome = "partial";
  else if (comparisons.some((row) => row.changed)) outcome = "changed";

  return result({
    outcome,
    clock,
    scheduleHint,
    fields,
    prior: summarizePrior(priorLoad),
    payment,
    stale,
    evidence: {
      kind: "comparable_records",
      schemaHint: "samedaydesk.extract-batch.v0",
      summary: {
        total: rows.length,
        success: success.length,
        failure: failed.length,
        changed: comparisons.filter((row) => row.changed).length,
        unchanged: comparisons.filter((row) => !row.changed).length,
      },
      rows,
      comparisons,
      contentHash: `sha256:${sha256Hex({ rows: success.map((row) => ({ sourceKey: row.sourceKey, fields: row.fields })) })}`,
    },
  });
}

function normalizeSources(input) {
  if (Array.isArray(input.sources)) return input.sources;
  if (input.currentFixturePath) return [{ kind: "fixture", path: input.currentFixturePath }];
  if (input.liveSafe) return [{ kind: "live_safe", url: input.liveUrl || "https://example.com/" }];
  return [];
}

async function extractOne(source, fields, input) {
  if (source.kind === "fixture" || source.path) {
    try {
      const loaded = loadFixtureSource(source.path);
      const fieldsOut =
        loaded.kind === "json"
          ? Object.fromEntries(fields.map((field) => [field, loaded.body[field] ?? loaded.body.fields?.[field] ?? null]))
          : extractComparableFields(loaded.text, fields);
      const missing = fields.filter((field) => fieldsOut[field] == null);
      return {
        sourceKey: source.sourceKey || source.path,
        status: missing.length === fields.length ? "failure" : "success",
        partial: missing.length > 0 && missing.length < fields.length,
        fields: fieldsOut,
        missing,
        error: missing.length === fields.length ? { code: "empty_extract", message: "no selected fields found" } : null,
        provenance: { transport: "fixture", path: source.path },
      };
    } catch (error) {
      return {
        sourceKey: source.sourceKey || source.path,
        status: "failure",
        fields: null,
        error: { code: "fixture_read", message: error instanceof Error ? error.message : String(error) },
      };
    }
  }

  if (source.kind === "live_safe" || source.url) {
    if (!input.liveSafe && source.requireLiveFlag !== false) {
      // allow explicit source entries when liveSafe is true on the run
    }
    if (!input.liveSafe) {
      return {
        sourceKey: source.url,
        status: "failure",
        fields: null,
        error: { code: "live_flag_required", message: "live sources require --live-safe" },
      };
    }
    const retried = await withRetries(
      async () => {
        const page = await fetchLiveSafe(source.url, { fetchImpl: input.fetchImpl, timeoutMs: input.timeoutMs });
        if (!page.ok) {
          const err = new Error(`status ${page.status}`);
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
    if (!retried.ok) {
      return {
        sourceKey: source.url,
        status: "failure",
        fields: null,
        error: { code: "live_fetch", message: retried.error.message },
        attempts: retried.attempts,
      };
    }
    const fieldsOut = extractComparableFields(retried.value.text, fields);
    return {
      sourceKey: source.url,
      status: "success",
      fields: fieldsOut,
      missing: fields.filter((field) => fieldsOut[field] == null),
      error: null,
      attempts: retried.attempts,
      provenance: {
        transport: "live_safe",
        finalUrl: retried.value.finalUrl,
        httpStatus: retried.value.status,
        byteLength: retried.value.bytes,
      },
    };
  }

  return {
    sourceKey: JSON.stringify(source),
    status: "failure",
    fields: null,
    error: { code: "unknown_source", message: "source must be fixture path or live_safe url" },
  };
}

function indexPriorRecords(payload) {
  const map = new Map();
  const records =
    payload?.records ||
    payload?.sources ||
    payload?.observation?.records ||
    payload?.payload?.records ||
    [];
  if (Array.isArray(records)) {
    for (const row of records) {
      const key = row.sourceKey || row.source || row.url || row.id;
      if (key) {
        map.set(String(key), row);
        map.set(basename(String(key)), row);
      }
    }
  } else if (payload?.fields) {
    map.set("default", { fields: payload.fields });
  } else if (payload?.title || payload?.h1) {
    map.set("default", { fields: { title: payload.title ?? null, h1: payload.h1 ?? null } });
  }
  return map;
}

function lookupPrior(map, sourceKey) {
  if (!sourceKey) return map.get("default") || null;
  const key = String(sourceKey);
  return map.get(key) || map.get(basename(key)) || map.get("default") || null;
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
