/**
 * Client endpoint for the changed-period recipe. The Make scenario, the n8n
 * workflow and the direct route all call these three routes:
 *
 *   POST {base}/evaluate  map every record with the declared mappingVersion, run the
 *                         Useful Commerce journey per record, classify each record as
 *                         ready, already_applied or exception
 *   POST {base}/apply     apply one ready record downstream (the external effect),
 *                         Idempotency-Key = ledgerKey; a second apply applies nothing
 *   POST {base}/replay    replay one record with the same journey idempotency key
 *                         (the request digest), for a retryable uncommitted record
 *
 * The journey runtime is the vendored Useful Commerce source, unchanged. Faults are
 * injected only by tests and the simulation; there is no network IO here.
 */
import { mapRecord, findMapping, validateMappingRegistry } from "./mapping.mjs";
import { journeyException, kitException } from "./exceptions.mjs";
import { createApplyReceipts, ledgerKeyOf } from "./ledger.mjs";
import {
  assertTermsUnchanged,
  bindOwedReferenceToJourney,
  CAPTURE_SCHEMA,
  loadCallerTerms,
  createEffectProjection,
  DEFAULT_HORIZON_HOURS,
  periodInterface,
  replayLaterPeriod,
  runRecordToAcceptedOutput,
} from "./vendor-paths.mjs";

export const CLIENT_ENDPOINT = "https://client.example.invalid/samedaydesk/workflow-kits-changed-period";
export const REQUEST_KIND = "samedaydesk.workflow-kits-n12-changed-period.request.v1";
export const RESULT_KIND = "samedaydesk.workflow-kits-n12-changed-period.result.v1";
export const PLATFORMS = Object.freeze(["make", "n8n", "direct"]);
export const OUTCOMES = Object.freeze(["ready", "already_applied", "exception"]);

const isPlainObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

/** Effect projection from the journey, wrapped only to count first commits per key. */
function countingEffects() {
  const inner = createEffectProjection();
  const commits = new Map();
  return {
    kind: "projection",
    get: (key) => inner.get(key),
    remember(key, effect) {
      const out = inner.remember(key, effect);
      if (out.applied) commits.set(key, (commits.get(key) ?? 0) + 1);
      return out;
    },
    commitCount: (key) => (key === undefined ? [...commits.values()].reduce((a, b) => a + b, 0) : commits.get(key) ?? 0),
  };
}

export function createChangedPeriodEndpoint({ clock, horizonHours = DEFAULT_HORIZON_HOURS, faults = [] } = {}) {
  if (!clock) throw new Error("clock is required so every run is deterministic");
  const receipts = createApplyReceipts();
  const effects = countingEffects();
  const contexts = new Map();
  const pending = new Map();
  const accepted = new Map();
  const remainingFaults = faults.map((fault) => ({ times: 1, ...fault }));
  const calls = [];
  let currentClock = clock;

  function takeFault(type, periodId, recordKey) {
    const fault = remainingFaults.find((f) => f.type === type && f.periodId === periodId && f.recordKey === recordKey && f.times > 0);
    if (!fault) return false;
    fault.times -= 1;
    return true;
  }

  function classify({ period, recordKey, periodId, mappingVersion, platform, capture, journeyResult, comparison }) {
    const base = {
      recordKey,
      idempotencyKey: period.idempotencyKey,
      ledgerKey: null,
      mappingVersion,
      termsVersion: period.recordEvidence.termsVersion,
      comparison,
      period,
      receipt: null,
    };
    if (period.exception) {
      const exception = journeyException(period, { recordKey, fieldPath: null });
      return { ...base, comparison: null, outcome: "exception", retryable: exception.retryable, sameIdempotencyKey: exception.sameIdempotencyKey, exception };
    }
    const ledgerKey = ledgerKeyOf(period.idempotencyKey, recordKey);
    const existing = receipts.get(ledgerKey);
    if (existing) return { ...base, ledgerKey, outcome: "already_applied", retryable: false, sameIdempotencyKey: null, exception: null, receipt: existing };
    const earlier = receipts.forPeriodRecord(periodId, recordKey);
    if (earlier) {
      const terms = assertTermsUnchanged(earlier.termsVersion, period.recordEvidence.termsVersion);
      const exception = terms.ok
        ? kitException("record_already_applied", { message: `record ${recordKey} was applied in ${periodId} under ${earlier.ledgerKey}`, recordKey, fieldPath: "period.periodId" })
        : kitException("terms_changed", {
            message: `record ${recordKey} was accepted in ${periodId} under ${terms.expectedVersion}; the exchange now supplies ${terms.actualVersion}`,
            recordKey,
            fieldPath: "period.termsInput.preview.termsVersion",
            fields: [{ kind: "terms_changed", path: "termsVersion", expected: terms.expectedVersion, actual: terms.actualVersion }],
            source: "ledger",
          });
      return { ...base, comparison: null, ledgerKey, outcome: "exception", retryable: false, sameIdempotencyKey: null, exception, receipt: earlier };
    }
    pending.set(ledgerKey, {
      ledgerKey,
      idempotencyKey: period.idempotencyKey,
      recordKey,
      periodId,
      taskId: period.recordEvidence.taskId,
      contextId: period.recordEvidence.contextId,
      followsTaskId: period.recordEvidence.followsTaskId,
      termsVersion: period.recordEvidence.termsVersion,
      captureId: period.recordEvidence.captureId,
      ingestionDigest: period.recordEvidence.ingestionDigest,
      mappingVersion,
      platform,
      output: capture.payload,
    });
    const acceptedKey = `${periodId}\u0000${recordKey}`;
    if (journeyResult?.acceptedOutput && !accepted.has(acceptedKey)) accepted.set(acceptedKey, journeyResult);
    return { ...base, ledgerKey, outcome: "ready", retryable: false, sameIdempotencyKey: null, exception: null };
  }

  function runJourney({ period: p, capture, recordKey }) {
    const caller = isPlainObject(p.caller) ? p.caller : {};
    const delivery = (contract) => ({
      committed: !takeFault("uncommitted", p.periodId, recordKey),
      requestDigest: contract.requestDigest,
      result: capture.payload,
      evidence: [
        { name: "termsVersion", value: contract.request.body.termsVersion },
        { name: "captureId", value: capture.captureId },
        { name: "comparisonRecord", value: { expected: "accepted-output", observed: "accepted-output" } },
      ],
    });
    const common = {
      periodId: p.periodId,
      taskId: p.taskId,
      contextId: p.contextId,
      termsInput: p.termsInput,
      ingestion: capture,
      delivery,
      correlationId: caller.correlationId ?? null,
      token: caller.token ?? "<REDACTED>",
      measurement: caller.measurement ?? null,
      continuationFileMissing: caller.continuationFileMissing === true,
      tool: caller.tool ?? null,
    };
    const prior = p.priorPeriodId ? accepted.get(`${p.priorPeriodId}\u0000${recordKey}`) : null;
    if (prior) {
      const result = replayLaterPeriod({
        periodN: prior,
        followUp: { ...common, step: caller.step ?? 1, owedReference: p.owedReference ?? undefined },
        clock: currentClock,
        horizonHours,
        effectProjection: effects,
      });
      const later = result.periodNPlus1 ?? null;
      const period = later?.period ?? periodInterface(result, { periodId: p.periodId });
      return { period, journeyResult: later, comparison: result.comparison?.outcome ?? null };
    }
    const result = runRecordToAcceptedOutput({
      ...common,
      followsTaskId: p.followsTaskId ?? null,
      step: caller.step ?? 0,
      clock: currentClock,
      horizonHours,
      effectProjection: effects,
    });
    return { period: result.period, journeyResult: result, comparison: p.priorPeriodId ? "new_record" : null };
  }

  /**
   * Before running the journey for a record already applied in this period, read
   * the exchange-supplied termsVersion through the journey's own terms projection
   * (no acceptance effect) and compare it with the receipt. A difference is
   * terms_changed: the old accepted terms stay on the receipt and nothing is
   * evaluated or applied under the new terms.
   */
  function termsPreservedCheck(p, recordKey) {
    const earlier = receipts.forPeriodRecord(p.periodId, recordKey);
    if (!earlier) return null;
    let projection;
    try {
      projection = loadCallerTerms({ ...p.termsInput, contextId: p.contextId });
    } catch {
      return null;
    }
    if (!projection || projection.ok === false || !projection.termsVersion) return null;
    const terms = assertTermsUnchanged(earlier.termsVersion, projection.termsVersion);
    if (terms.ok) return null;
    return {
      receipt: earlier,
      exception: kitException("terms_changed", {
        message: `record ${recordKey} was accepted in ${p.periodId} under ${terms.expectedVersion}; the exchange now supplies ${terms.actualVersion}`,
        recordKey,
        fieldPath: "period.termsInput.preview.termsVersion",
        fields: [{ kind: "terms_changed", path: "termsVersion", expected: terms.expectedVersion, actual: terms.actualVersion }],
        source: "ledger",
      }),
    };
  }

  function invalid(periodId, configErrors) {
    return { status: 200, body: { kind: RESULT_KIND, ok: false, periodId, mappingVersion: null, owedBinding: null, configErrors, summary: summarize([]), records: [] } };
  }

  function evaluate(body) {
    const errs = [];
    if (!isPlainObject(body)) return invalid(null, [kitException("request_invalid", { message: "request body must be a JSON object", fieldPath: "$" })]);
    if (body.kind !== REQUEST_KIND) errs.push(kitException("request_invalid", { message: `kind must be ${REQUEST_KIND}`, fieldPath: "kind" }));
    if (!PLATFORMS.includes(body.platform)) errs.push(kitException("request_invalid", { message: `platform must be one of ${PLATFORMS.join(", ")}`, fieldPath: "platform" }));
    const p = body.period;
    if (!isPlainObject(p)) errs.push(kitException("request_invalid", { message: "period must be an object", fieldPath: "period" }));
    else for (const field of ["periodId", "taskId", "contextId", "mappingVersion"]) {
      if (typeof p[field] !== "string" || !p[field]) errs.push(kitException("request_invalid", { message: `period.${field} must be a non-empty string`, fieldPath: `period.${field}` }));
    }
    if (!Array.isArray(body.records)) errs.push(kitException("request_invalid", { message: "records must be an array of workflow output records", fieldPath: "records" }));
    const periodId = isPlainObject(p) && typeof p.periodId === "string" ? p.periodId : null;
    if (errs.length) return invalid(periodId, errs);

    const registryCheck = validateMappingRegistry(body.mappings);
    if (!registryCheck.ok) {
      return invalid(periodId, registryCheck.errors.map((e) => kitException("mapping_invalid", { message: e.message, fieldPath: `mappings${e.path.slice(1)}` })));
    }
    const entry = findMapping(body.mappings, p.mappingVersion);
    if (!entry) {
      const known = body.mappings.versions.map((v) => v.mappingVersion).join(", ");
      return invalid(periodId, [kitException("mapping_version_unknown", { message: `mappingVersion ${p.mappingVersion} is not declared; declared versions: ${known}`, fieldPath: "period.mappingVersion" })]);
    }

    let owedBinding = null;
    if (p.owedReference != null) {
      const bound = bindOwedReferenceToJourney(p.owedReference, { correlationId: p.caller?.correlationId ?? null });
      if (!bound.ok) {
        return invalid(periodId, [kitException(bound.code, { message: bound.message, fieldPath: "period.owedReference", source: "journey" })]);
      }
      owedBinding = bound.binding;
    }

    const mapped = body.records.map((record) => mapRecord(entry, record, { captureSchema: CAPTURE_SCHEMA }));
    const keys = new Map();
    mapped.forEach((m, i) => { if (m.recordKey) keys.set(m.recordKey, [...(keys.get(m.recordKey) ?? []), i]); });
    const dupes = [...keys.entries()].filter(([, at]) => at.length > 1);
    if (dupes.length) {
      return invalid(periodId, dupes.map(([key, at]) => kitException("record_key_duplicate", { message: `recordKey ${key} appears at records ${at.join(", ")}`, recordKey: key, fieldPath: `records[${at[1]}]` })));
    }

    const records = mapped.map((m, i) => {
      if (!m.ok) {
        const first = m.differences[0];
        const exception = kitException("schema_changed", {
          message: `record does not match mapping ${entry.mappingVersion}: ${m.differences.map((d) => `${d.kind} ${d.path}`).join("; ")}`,
          recordKey: m.recordKey,
          fieldPath: `records[${i}]${first.path ? `.${first.path}` : ""}`,
          fields: m.differences,
          source: "mapping",
        });
        return {
          recordKey: m.recordKey, outcome: "exception", idempotencyKey: null, ledgerKey: null, mappingVersion: entry.mappingVersion,
          termsVersion: null, comparison: null, period: null, receipt: null, retryable: false, sameIdempotencyKey: null, exception,
          completeness: { complete: false, missingFields: m.differences.filter((d) => d.kind !== "field_unexpected").map((d) => d.path) },
        };
      }
      const preserved = termsPreservedCheck(p, m.recordKey);
      if (preserved) {
        return {
          recordKey: m.recordKey, outcome: "exception", idempotencyKey: null, ledgerKey: preserved.receipt.ledgerKey, mappingVersion: entry.mappingVersion,
          termsVersion: preserved.receipt.termsVersion, comparison: null, period: null, receipt: preserved.receipt, retryable: false, sameIdempotencyKey: null,
          exception: preserved.exception,
        };
      }
      const run = () => runJourney({ period: p, capture: m.capture, recordKey: m.recordKey });
      const first = run();
      if (first.period.idempotencyKey) contexts.set(first.period.idempotencyKey, { run, periodId: p.periodId, recordKey: m.recordKey, mappingVersion: entry.mappingVersion, platform: body.platform, capture: m.capture });
      const out = classify({ ...first, recordKey: m.recordKey, periodId: p.periodId, mappingVersion: entry.mappingVersion, platform: body.platform, capture: m.capture });
      if (out.exception && out.exception.source === "journey") out.exception.fieldPath = journeyFieldPath(out.exception.code, entry, i);
      return out;
    });
    return { status: 200, body: { kind: RESULT_KIND, ok: true, periodId: p.periodId, mappingVersion: entry.mappingVersion, owedBinding, configErrors: [], summary: summarize(records), records } };
  }

  function apply(body, headers) {
    const key = headers["Idempotency-Key"];
    if (!isPlainObject(body) || !key || key !== body.ledgerKey) {
      return { status: 400, body: { outcome: "exception", exception: kitException("request_invalid", { message: "Idempotency-Key header must equal body.ledgerKey", fieldPath: "ledgerKey" }) } };
    }
    const existing = receipts.get(key);
    if (existing) return { status: 200, body: { outcome: "already_applied", duplicate: true, receipt: existing } };
    const draft = pending.get(key);
    if (!draft) return { status: 409, body: { outcome: "exception", exception: kitException("apply_without_evaluation", { message: `no ready evaluation for ${key}`, fieldPath: "ledgerKey" }) } };
    const { receipt } = receipts.apply({ ...draft, appliedAt: currentClock });
    pending.delete(key);
    if (takeFault("lost_apply_reply", draft.periodId, draft.recordKey)) {
      return { transportError: true, message: "connection reset after the apply was committed (injected lost reply)" };
    }
    return { status: 201, body: { outcome: "applied", duplicate: false, receipt } };
  }

  function replay(body, headers) {
    const key = headers["Idempotency-Key"];
    const ctx = key ? contexts.get(key) : null;
    if (!isPlainObject(body) || !ctx || body.idempotencyKey !== key) {
      return { status: 404, body: { ok: false, exception: kitException("request_invalid", { message: "replay needs the same idempotency key that evaluate returned", fieldPath: "idempotencyKey" }) } };
    }
    const again = ctx.run();
    if (again.period.idempotencyKey !== key) throw new Error("replay produced a different idempotency key");
    const record = classify({ ...again, recordKey: ctx.recordKey, periodId: ctx.periodId, mappingVersion: ctx.mappingVersion, platform: ctx.platform, capture: ctx.capture });
    return { status: 200, body: { ok: true, record } };
  }

  function handle({ method = "POST", url, headers = {}, body }) {
    const path = url.startsWith(CLIENT_ENDPOINT) ? url.slice(CLIENT_ENDPOINT.length) : null;
    let res;
    if (method !== "POST" || path === null) res = { status: 404, body: { ok: false } };
    else if (path === "/evaluate") res = evaluate(body);
    else if (path === "/apply") res = apply(body, headers);
    else if (path === "/replay") res = replay(body, headers);
    else res = { status: 404, body: { ok: false } };
    calls.push({ route: path, platform: body?.platform ?? null, status: res.transportError ? "transport_error" : res.status });
    return res;
  }

  return {
    handle,
    receipts,
    effects,
    calls,
    setClock(next) { currentClock = next; },
    externalEffects: () => receipts.effects(),
  };
}

/**
 * Point a journey exception at the field that caused it: the source field the
 * declared mapping reads for that capture target, or the period field.
 */
const JOURNEY_FIELD = Object.freeze({
  capture_stale: "capture.capturedAt",
  ingestion_clock_invalid: "capture.capturedAt",
  ingestion_not_permitted: "capture.permitted",
  ingestion_incomplete: "capture.captureId",
});
const PERIOD_FIELD = Object.freeze({
  terms_changed: "period.termsInput.claimedTermsVersion",
  terms_invalid: "period.termsInput",
  token_used_as_task_ref: "period.taskId",
  task_id_invalid: "period.taskId",
  token_in_public_record: "period.caller.token",
  correlation_id_invalid: "period.caller.correlationId",
  follow_up_not_new_task: "period.taskId",
  context_mismatch: "period.contextId",
  continuation_file_missing: "period.caller.continuationFileMissing",
});

export function journeyFieldPath(code, entry, index) {
  if (PERIOD_FIELD[code]) return PERIOD_FIELD[code];
  const rule = JOURNEY_FIELD[code] ? entry.targets[JOURNEY_FIELD[code]] : null;
  return rule && rule.from ? `records[${index}].${rule.from}` : `records[${index}]`;
}

export function summarize(records) {
  const count = (outcome) => records.filter((r) => r.outcome === outcome).length;
  return {
    records: records.length,
    ready: count("ready"),
    alreadyApplied: count("already_applied"),
    exceptions: count("exception"),
    retryable: records.filter((r) => r.retryable).length,
  };
}
