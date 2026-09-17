import { validateRecord } from "./validate.mjs";
import { detectPrivateTerms } from "./private-terms.mjs";
import { detectH04Leak } from "./h04.mjs";
import { documentKey, loadJson, loadStore, rememberWrittenRecord, writeRecord } from "./store.mjs";

function primaryCode(errors, preferred) {
  const hit = errors.find((item) => preferred.includes(item.code));
  return hit ? hit.code : errors[0]?.code || "invalid_record";
}

export function ingestRecord(store, candidate, options = {}) {
  const write = options.write === true;
  const at = options.at || new Date().toISOString();

  const privateErrors = detectPrivateTerms(candidate);
  if (privateErrors.length > 0) {
    return {
      ok: false,
      accepted: false,
      refused: true,
      code: "private_terms_scrape",
      message: "scrape of private terms is refused",
      errors: privateErrors,
    };
  }

  const h04 = detectH04Leak(candidate);
  if (h04.length > 0) {
    return {
      ok: false,
      accepted: false,
      refused: true,
      code: "h04_regression_pack_leak",
      message: "H04 licensed regression material is out of bounds",
      errors: h04,
    };
  }

  if (candidate?.coverage?.universal === true) {
    return {
      ok: false,
      accepted: false,
      refused: true,
      code: "universal_coverage_claim",
      message: "universal coverage claims are refused",
      errors: [{ code: "universal_coverage_claim", path: "coverage.universal", message: "forbidden" }],
    };
  }

  const result = validateRecord(candidate);
  if (!result.ok) {
    return {
      ok: false,
      accepted: false,
      refused: true,
      code: primaryCode(result.errors, [
        "private_terms_scrape",
        "universal_coverage_claim",
        "missing_version",
        "missing_republication",
        "missing_attribution",
      ]),
      message: "candidate failed work-terms validation",
      errors: result.errors,
    };
  }

  const existingIds = new Set(store.records.map((item) => item.record.id));
  if (existingIds.has(candidate.id)) {
    return {
      ok: false,
      accepted: false,
      refused: true,
      code: "duplicate_id",
      message: `record ${candidate.id} already exists`,
      errors: [{ code: "duplicate_id", path: "id", message: "duplicate" }],
    };
  }

  const existingVersionIds = new Set(
    store.records.map((item) => item.record.version?.id).filter((id) => typeof id === "string"),
  );
  if (existingVersionIds.has(candidate.version.id)) {
    return {
      ok: false,
      accepted: false,
      refused: true,
      code: "duplicate_version",
      message: `version ${candidate.version.id} already exists`,
      errors: [{ code: "duplicate_version", path: "version.id", message: "duplicate" }],
    };
  }

  const named = (store.catalog.platforms || []).find((platform) => platform && platform.id === candidate.platformId);
  if (!named) {
    return {
      ok: false,
      accepted: false,
      refused: true,
      code: "unlisted_platform",
      message: `platform ${candidate.platformId} is not a named source in the catalog`,
      errors: [{ code: "unlisted_platform", path: "platformId", message: "unnamed platform" }],
    };
  }
  if (!Array.isArray(named.documents) || !named.documents.includes(candidate.documentKind)) {
    return {
      ok: false,
      accepted: false,
      refused: true,
      code: "unlisted_document_kind",
      message: `documentKind ${candidate.documentKind} is not named for ${candidate.platformId}`,
      errors: [{ code: "unlisted_document_kind", path: "documentKind", message: "unnamed document kind" }],
    };
  }

  if (candidate.status !== "current") {
    return {
      ok: false,
      accepted: false,
      refused: true,
      code: "ingest_requires_current",
      message: "ingest accepts only current observations; use invalidate for withdrawals",
      errors: [{ code: "ingest_requires_current", path: "status", message: "status must be current" }],
    };
  }

  const key = documentKey(candidate);
  const previousCurrent = store.records.filter(
    (item) => documentKey(item.record) === key && item.record.status === "current",
  );

  if (previousCurrent.length > 0) {
    const currentIds = previousCurrent.map((item) => item.record.id);
    if (!currentIds.includes(candidate.version.supersedes)) {
      return {
        ok: false,
        accepted: false,
        refused: true,
        code: "missing_version",
        message: "version.supersedes must name the current record being replaced",
        errors: [{ code: "missing_version", path: "version.supersedes", message: "must name current record" }],
      };
    }
    const latest = previousCurrent
      .map((item) => item.record.version?.observedAt || "")
      .sort()
      .at(-1);
    if (candidate.version.observedAt <= latest) {
      return {
        ok: false,
        accepted: false,
        refused: true,
        code: "stale_observation",
        message: "new current observation must have a later observedAt than the current version",
        errors: [{ code: "stale_observation", path: "version.observedAt", message: "not later than current" }],
      };
    }
  }

  const superseded = [];
  if (write) {
    for (const item of previousCurrent) {
      item.record.status = "superseded";
      writeRecord(store.root, item.record);
      superseded.push(item.record.id);
    }
    const filePath = writeRecord(store.root, candidate);
    store.records.push({ filePath, file: `${candidate.id}.json`, record: candidate });
    rememberWrittenRecord(store, candidate);
  } else {
    for (const item of previousCurrent) superseded.push(item.record.id);
  }

  return {
    ok: true,
    accepted: true,
    refused: false,
    code: "accepted",
    message: previousCurrent.length > 0 ? "accepted; previous current version superseded" : "accepted",
    recordId: candidate.id,
    documentKey: key,
    superseded,
    dryRun: !write,
    at,
  };
}

export function ingestFile(root, filePath, options = {}) {
  const store = loadStore(root);
  const candidate = loadJson(filePath);
  return ingestRecord(store, candidate, options);
}
