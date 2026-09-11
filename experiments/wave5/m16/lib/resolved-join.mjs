import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ENGINE_REPORT_SCHEMA, TRIAL_SCHEMA } from "./pins.mjs";
import { trialRefuse } from "./errors.mjs";

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function packagesMap(doc) {
  return isPlainObject(doc?.packages) ? doc.packages : {};
}

export function resolvedOf(doc, id) {
  const entry = packagesMap(doc)[id];
  return typeof entry?.resolved === "string" && entry.resolved.trim() !== "" ? entry.resolved.trim() : null;
}

function nameFromPackagesId(id, entry) {
  if (typeof entry?.name === "string" && entry.name.trim()) return entry.name.trim();
  const marker = "node_modules/";
  const idx = String(id || "").lastIndexOf(marker);
  const rest = idx >= 0 ? id.slice(idx + marker.length) : id;
  return rest || id;
}

export function parseLockJson(filePath, label) {
  const text = readFileSync(filePath, "utf8");
  let doc;
  try {
    doc = JSON.parse(text);
  } catch (err) {
    throw trialRefuse("input-malformed", `${label} is not JSON: ${err.message}`, { path: filePath });
  }
  if (!isPlainObject(doc)) {
    throw trialRefuse("not-a-lockfile", `${label} is not a lockfile object`, { path: filePath });
  }
  return doc;
}

function publicResolvedPin(pin, doc) {
  return {
    id: pin.id,
    name: pin.name,
    version: pin.version,
    integrity: pin.integrity,
    termsHash: pin.termsHash,
    missingIntegrity: pin.missingIntegrity,
    resolved: resolvedOf(doc, pin.id),
  };
}

export function joinResolved(engineReport, beforeDoc, afterDoc) {
  const changed = (engineReport.changed || []).map((item) => {
    const beforeResolved = resolvedOf(beforeDoc, item.id);
    const afterResolved = resolvedOf(afterDoc, item.id);
    const changeKinds = [...(item.changeKinds || [])];
    if (beforeResolved !== afterResolved && !changeKinds.includes("resolved")) {
      changeKinds.push("resolved");
    }
    return {
      id: item.id,
      name: item.name,
      before: { ...publicResolvedPin(item.before || {}, beforeDoc), resolved: beforeResolved },
      after: { ...publicResolvedPin(item.after || {}, afterDoc), resolved: afterResolved },
      changeKinds,
      engineListed: true,
    };
  });
  const added = (engineReport.added || []).map((pin) => ({
    ...publicResolvedPin(pin, afterDoc),
    engineListed: true,
  }));
  const removed = (engineReport.removed || []).map((pin) => ({
    ...publicResolvedPin(pin, beforeDoc),
    engineListed: true,
  }));
  return { changed, added, removed };
}

export function resolvedOnlyOmitted(beforeDoc, afterDoc, engineReport) {
  const listed = new Set([
    ...(engineReport.changed || []).map((i) => i.id),
    ...(engineReport.added || []).map((i) => i.id),
    ...(engineReport.removed || []).map((i) => i.id),
  ]);
  const beforePkgs = packagesMap(beforeDoc);
  const afterPkgs = packagesMap(afterDoc);
  const ids = [...new Set([...Object.keys(beforePkgs), ...Object.keys(afterPkgs)])].sort();
  const omitted = [];
  for (const id of ids) {
    if (id === "") continue;
    if (listed.has(id)) continue;
    const before = beforePkgs[id];
    const after = afterPkgs[id];
    if (!isPlainObject(before) || !isPlainObject(after)) continue;
    const b = typeof before.resolved === "string" ? before.resolved : null;
    const a = typeof after.resolved === "string" ? after.resolved : null;
    if (b === a) continue;
    if (before.version !== after.version || before.integrity !== after.integrity) continue;
    omitted.push({
      id,
      name: nameFromPackagesId(id, after) || nameFromPackagesId(id, before),
      before: { version: before.version || null, integrity: before.integrity || null, resolved: b },
      after: { version: after.version || null, integrity: after.integrity || null, resolved: a },
      changeKinds: ["resolved"],
      engineListed: false,
    });
  }
  return omitted;
}

export function assertUnlikeTermsHashes({ pinTermsHash, disclosureHash, trialDigest }) {
  if (pinTermsHash && disclosureHash && pinTermsHash === disclosureHash) {
    throw trialRefuse(
      "unlike-terms-forced-equal",
      "pin terms hash must not be forced equal to a disclosure-document hash",
      { schemaA: ENGINE_REPORT_SCHEMA, schemaB: "disclosure" },
    );
  }
  if (pinTermsHash && trialDigest && pinTermsHash === trialDigest) {
    throw trialRefuse(
      "unlike-terms-forced-equal",
      "pin terms hash must not be forced equal to the trial digest",
      { schemaA: ENGINE_REPORT_SCHEMA, schemaB: TRIAL_SCHEMA },
    );
  }
}
