import { ENGINE_ID, ENGINE_VERSION, ERROR_CODES, REPORT_SCHEMA } from "./constants.mjs";
import { requireClock, observationFreshness } from "./clock.mjs";
import { normalizeFields, pickPresent } from "./fields.mjs";
import { hashJobTerms, jobTermsBody, sha256Hex } from "./hash-terms.mjs";
import { matchBatches } from "./match.mjs";
import { parseExtractBatch } from "./parse-batch.mjs";
import { diffJson, excerpt } from "./diff.mjs";
import { refuseLiveFetch, refusePaymentRetry, refuseQuoteAsSuccess, refuseSampleAsDelivered } from "./refuse.mjs";
import { inMemoryJson, readBoundedJson } from "./io.mjs";
import { stableStringify } from "./canonical.mjs";
import { normalizeLimits } from "./limits.mjs";

function classifyVerdict({ missing, failed, unknown, duplicates, coverageUnknown, semantic, order, truncated, matched }) {
  if (duplicates.length) return "ambiguous";
  if (semantic) return "changed";
  if (truncated) return "incomplete";
  if (missing.length || failed.length || unknown.length || coverageUnknown.length) return "incomplete";
  if (order) return "reordered";
  if (!matched.length) return "incomplete";
  return "unchanged";
}

function noteLimit(hits, name) {
  if (name && !hits.includes(name)) hits.push(name);
}

export async function comparePageChange({
  beforePath,
  afterPath,
  beforeJson,
  afterJson,
  fields,
  clock,
  limits: limitsInput,
  hasher,
  treatQuoteAsSuccess = false,
  retryPayment = false,
  sample = false,
  example = false,
  deliveredWatch = false,
  liveUrl,
  fetch: fetchFlag,
  live,
  evidenceClass = "fixture",
} = {}) {
  refuseLiveFetch(beforePath, afterPath, { liveUrl, fetch: fetchFlag, live });
  refusePaymentRetry({ retryPayment });
  refuseSampleAsDelivered({ sample, example, deliveredWatch });

  const requiredClock = requireClock(clock);
  const selectedFields = normalizeFields(fields);
  const limits = normalizeLimits(limitsInput);
  if (selectedFields.length > limits.maxFields) {
    const error = new Error(`fields exceed maxFields ${limits.maxFields}`);
    error.code = ERROR_CODES.FIELDS_REQUIRED;
    throw error;
  }

  const started = process.hrtime.bigint();
  const beforeFile = beforeJson !== undefined
    ? inMemoryJson(beforeJson, limits.maxBytes, beforePath)
    : readBoundedJson(beforePath, limits.maxBytes);
  const afterFile = afterJson !== undefined
    ? inMemoryJson(afterJson, limits.maxBytes, afterPath)
    : readBoundedJson(afterPath, limits.maxBytes);

  refuseQuoteAsSuccess(beforeFile.parsed, { treatQuoteAsSuccess });
  refuseQuoteAsSuccess(afterFile.parsed, { treatQuoteAsSuccess });

  const beforeBatch = parseExtractBatch(beforeFile.parsed, limits, { treatQuoteAsSuccess });
  const afterBatch = parseExtractBatch(afterFile.parsed, limits, { treatQuoteAsSuccess });

  const terms = jobTermsBody({
    fields: selectedFields,
    clock: requiredClock,
    beforeSha256: beforeFile.sha256,
    afterSha256: afterFile.sha256,
  });
  const termsVersion = await hashJobTerms(terms, { hasher });

  const report = {
    schema: REPORT_SCHEMA,
    kind: beforeBatch.kind === afterBatch.kind ? beforeBatch.kind : null,
    verdict: "incomparable",
    fields: [...selectedFields],
    claims: {
      noChangeProven: false,
      contentUnchangedProven: false,
      comparable: false,
      complete: false,
      current: false,
      fresh: false,
      usefulOutputProven: false,
      paymentImpliesUsefulOutput: false,
    },
    freshness: "unknown",
    snapshot: {
      schema: "pilot/change-digest/v1",
      verdict: "incomparable",
      claims: {
        noChangeProven: false,
        current: false,
        comparable: false,
        fresh: false,
      },
      freshness: "unknown",
      before: {
        status: "present",
        mediaType: "application/json",
        observedAt: null,
        truncated: false,
        byteLength: beforeFile.byteLength,
        sha256: beforeFile.sha256,
        source: { kind: "file", role: "before" },
        issues: [],
      },
      after: {
        status: "present",
        mediaType: "application/json",
        observedAt: null,
        truncated: false,
        byteLength: afterFile.byteLength,
        sha256: afterFile.sha256,
        source: { kind: "file", role: "after" },
        issues: [],
      },
      limitsHit: [],
    },
    summary: {
      matched: 0,
      missing: 0,
      failed: 0,
      unknown: 0,
      duplicates: 0,
      coverageUnknown: 0,
      semantic: 0,
      order: 0,
    },
    rows: { matched: [], missing: [], failed: [], unknown: [], duplicates: [] },
    coverageUnknown: [],
    changes: [],
    observations: {
      before: null,
      after: null,
      note: "Source URL identity is separate from two-time observation identity. fetchedAt and completedAt are observation metadata, not content freshness.",
    },
    provenance: {
      engine: ENGINE_ID,
      engineVersion: ENGINE_VERSION,
      merchantCompareImported: false,
      networkUsed: false,
      paymentAttempted: false,
      purchaseAuthorized: false,
      evidenceClass,
      termsVersion,
      termsHasher: process.env.FUNDED_TASK_TERMS_MODULE ? "injected" : "i01-integrated-hash-terms",
      comparedWithClock: requiredClock,
      beforeSha256: beforeFile.sha256,
      afterSha256: afterFile.sha256,
      elapsedMs: null,
    },
  };

  const fatalIssue = (issues) => issues.some((issue) =>
    issue === "merchant_product_mismatch"
    || issue === "merchant_schema_mismatch"
    || issue === "merchant_required_keys_missing"
    || issue === "merchant_sources_missing");

  if (!report.kind || fatalIssue(beforeBatch.issues) || fatalIssue(afterBatch.issues)) {
    report.coverageUnknown.push(...beforeBatch.issues.map((code) => ({ side: "before", code })));
    report.coverageUnknown.push(...afterBatch.issues.map((code) => ({ side: "after", code })));
    report.provenance.elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
    report.provenance.digestSha256 = sha256Hex(Buffer.from(stableStringify(digestBody(report))));
    return report;
  }

  report.observations.before = {
    jobId: beforeBatch.jobId,
    jobStatus: beforeBatch.jobStatus,
    charged: beforeBatch.charged,
    ok: beforeBatch.ok,
    snapshotObservedAt: null,
    artifactObservedAt: beforeBatch.observation.artifactObservedAt,
    rows: beforeBatch.rows.map((row) => ({ sourceKey: row.sourceKey, ...row.observation })),
  };
  report.observations.after = {
    jobId: afterBatch.jobId,
    jobStatus: afterBatch.jobStatus,
    charged: afterBatch.charged,
    ok: afterBatch.ok,
    snapshotObservedAt: null,
    artifactObservedAt: afterBatch.observation.artifactObservedAt,
    rows: afterBatch.rows.map((row) => ({ sourceKey: row.sourceKey, ...row.observation })),
  };

  const matched = matchBatches(beforeBatch, afterBatch);
  const changes = [];
  const coverageUnknown = [
    ...beforeBatch.issues.map((code) => ({ side: "before", code })),
    ...afterBatch.issues.map((code) => ({ side: "after", code })),
    ...[["before", beforeBatch], ["after", afterBatch]].flatMap(([side, batch]) =>
      batch.rows.flatMap((row) => row.coverageIssues.map((code) => ({ side, sourceKey: row.sourceKey, code })))),
  ];
  const limitsHit = [];
  let diffTruncated = beforeBatch.truncated || afterBatch.truncated;
  if (beforeBatch.truncated || afterBatch.truncated) noteLimit(limitsHit, "maxSources");
  report.snapshot.before.truncated = beforeBatch.truncated === true;
  report.snapshot.after.truncated = afterBatch.truncated === true;
  report.snapshot.before.observedAt = beforeBatch.observation.artifactObservedAt;
  report.snapshot.after.observedAt = afterBatch.observation.artifactObservedAt;

  for (const pair of matched.matched) {
    const beforePick = pickPresent(pair.before.data, selectedFields);
    const afterPick = pickPresent(pair.after.data, selectedFields);
    const both = selectedFields.filter((field) => Object.hasOwn(beforePick.present, field) && Object.hasOwn(afterPick.present, field));
    const missingBothSides = selectedFields.filter((field) => !Object.hasOwn(beforePick.present, field) || !Object.hasOwn(afterPick.present, field));
    for (const field of missingBothSides) {
      coverageUnknown.push({
        sourceKey: pair.sourceKey,
        field,
        beforePresent: Object.hasOwn(beforePick.present, field),
        afterPresent: Object.hasOwn(afterPick.present, field),
        reason: "absent_field_is_coverage_unknown_not_deletion",
      });
    }
    const comparableBefore = Object.create(null);
    const comparableAfter = Object.create(null);
    for (const field of both) {
      comparableBefore[field] = beforePick.present[field];
      comparableAfter[field] = afterPick.present[field];
    }
    if (both.length) {
      const fieldDiff = diffJson(comparableBefore, comparableAfter, limits);
      if (fieldDiff.truncated) {
        diffTruncated = true;
        noteLimit(limitsHit, fieldDiff.limitHit ?? "maxChanges");
      }
      for (const change of fieldDiff.changes) {
        if (changes.length >= limits.maxChanges) {
          diffTruncated = true;
          noteLimit(limitsHit, "maxChanges");
          break;
        }
        changes.push({ ...change, sourceKey: pair.sourceKey });
      }
    }
  }

  if (matched.order.reordered) {
    if (changes.length >= limits.maxChanges) {
      diffTruncated = true;
      noteLimit(limitsHit, "maxChanges");
    } else {
      changes.push({
        class: "order",
        op: "reorder",
        path: "/sources",
        sourceKey: null,
        before: matched.order.before,
        after: matched.order.after,
        beforeType: "array",
        afterType: "array",
        beforeEvidence: excerpt(matched.order.before, limits.maxExcerptBytes),
        afterEvidence: excerpt(matched.order.after, limits.maxExcerptBytes),
        evidenceTruncated: [matched.order.before, matched.order.after].some((value) =>
          Buffer.byteLength(JSON.stringify(value)) > limits.maxExcerptBytes),
      });
    }
  }

  const semantic = changes.some((change) => change.class === "semantic");
  const order = changes.some((change) => change.class === "order");
  const verdict = classifyVerdict({
    matched: matched.matched,
    missing: matched.missing,
    failed: matched.failed,
    unknown: matched.unknown,
    duplicates: matched.duplicates,
    coverageUnknown,
    semantic,
    order,
    truncated: diffTruncated,
  });
  const complete = (verdict === "unchanged" || verdict === "reordered" || verdict === "changed")
    && matched.missing.length === 0
    && matched.failed.length === 0
    && matched.unknown.length === 0
    && coverageUnknown.length === 0
    && !diffTruncated
    && matched.duplicates.length === 0;
  const contentUnchangedProven = !semantic && coverageUnknown.length === 0 && matched.duplicates.length === 0 && matched.matched.length > 0 && !diffTruncated;
  const comparedFieldPairs = matched.matched.filter((pair) => {
    const beforePick = pickPresent(pair.before.data, selectedFields);
    const afterPick = pickPresent(pair.after.data, selectedFields);
    return selectedFields.some((field) => Object.hasOwn(beforePick.present, field) && Object.hasOwn(afterPick.present, field));
  }).length;

  report.verdict = verdict;
  report.snapshot.verdict = verdict;
  report.claims.comparable = true;
  report.snapshot.claims.comparable = true;
  report.claims.complete = complete;
  report.claims.noChangeProven = verdict === "unchanged" && complete && contentUnchangedProven;
  report.claims.contentUnchangedProven = contentUnchangedProven && (verdict === "unchanged" || verdict === "reordered");
  report.claims.usefulOutputProven = comparedFieldPairs > 0 && (verdict === "changed" || verdict === "unchanged" || verdict === "reordered");
  report.claims.paymentImpliesUsefulOutput = false;
  const time = observationFreshness({
    observedAt: afterBatch.observation.artifactObservedAt,
    observedAts: matched.matched.map((pair) => pair.after.observation.completedAt),
    clock: requiredClock,
    maxStaleMs: limits.maxStaleMs,
  });
  report.freshness = time.freshness;
  report.snapshot.freshness = time.freshness;
  report.claims.current = time.current === true && complete;
  report.claims.fresh = false;
  report.snapshot.claims.noChangeProven = report.claims.noChangeProven;
  report.snapshot.claims.current = report.claims.current;
  report.snapshot.claims.fresh = false;
  report.snapshot.limitsHit = limitsHit;
  report.summary = {
    matched: matched.matched.length,
    missing: matched.missing.length,
    failed: matched.failed.length,
    unknown: matched.unknown.length,
    duplicates: matched.duplicates.length,
    coverageUnknown: coverageUnknown.length,
    semantic: changes.filter((change) => change.class === "semantic").length,
    order: changes.filter((change) => change.class === "order").length,
  };
  report.rows = {
    matched: matched.matched.map((pair) => ({
      sourceKey: pair.sourceKey,
      source: pair.before.source,
      before: { id: pair.before.id, status: pair.before.status },
      after: { id: pair.after.id, status: pair.after.status },
    })),
    missing: matched.missing.map((item) => ({
      sourceKey: item.sourceKey,
      missingSide: item.side,
      status: item.status,
      source: item.row.source,
      id: item.row.id,
    })),
    failed: matched.failed,
    unknown: matched.unknown,
    duplicates: matched.duplicates,
  };
  report.coverageUnknown = coverageUnknown;
  report.changes = changes;
  report.provenance.elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
  report.provenance.digestSha256 = sha256Hex(Buffer.from(stableStringify(digestBody(report))));
  return report;
}

function digestBody(report) {
  return {
    schema: report.schema,
    kind: report.kind,
    verdict: report.verdict,
    fields: report.fields,
    claims: report.claims,
    freshness: report.freshness,
    summary: report.summary,
    rows: report.rows,
    coverageUnknown: report.coverageUnknown,
    changes: report.changes.map((change) => ({
      class: change.class,
      op: change.op,
      path: change.path,
      sourceKey: change.sourceKey,
      before: change.before,
      after: change.after,
      beforeType: change.beforeType,
      afterType: change.afterType,
    })),
    provenance: {
      comparedWithClock: report.provenance.comparedWithClock,
      beforeSha256: report.provenance.beforeSha256,
      afterSha256: report.provenance.afterSha256,
      termsVersion: report.provenance.termsVersion,
    },
  };
}

export function envelope(job, report) {
  return {
    job: {
      id: job?.id ?? null,
      title: job?.title ?? null,
      fields: report.fields,
    },
    report,
  };
}
