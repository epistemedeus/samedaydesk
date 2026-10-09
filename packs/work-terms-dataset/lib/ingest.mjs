import { validateRecord } from "./validate.mjs";
import { detectPrivateTerms } from "./private-terms.mjs";
import { detectH04Leak } from "./h04.mjs";
import { documentKey, loadJson, loadStore, writeRecord } from "./store.mjs";

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

  const key = documentKey(candidate);
  const previousCurrent = store.records.filter(
    (item) => documentKey(item.record) === key && item.record.status === "current",
  );

  const superseded = [];
  if (write) {
    for (const item of previousCurrent) {
      item.record.status = "superseded";
      writeRecord(store.root, item.record);
      superseded.push(item.record.id);
    }
    const filePath = writeRecord(store.root, candidate);
    store.records.push({ filePath, file: `${candidate.id}.json`, record: candidate });
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
