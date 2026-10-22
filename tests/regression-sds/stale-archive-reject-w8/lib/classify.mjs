/**
 * Classify archive-identity claims.
 * Defect = treating a stale useful-jobs archive as the current catalog
 * (ok/pass/current) rather than refusing it.
 */
import { EXPECTED_CURRENT, readKitPin, stalePinsFromKit } from "./pin.mjs";
import { NEGATIVE_CONTROL_VERSION, PRINCIPLE } from "./root.mjs";

function claimSuccess(output) {
  if (!output || typeof output !== "object") return false;
  if (output.ok === true) return true;
  if (output.status === "pass" || output.status === "ok" || output.status === "success")
    return true;
  if (output.verdict === "pass" || output.verdict === "accept" || output.verdict === "current")
    return true;
  if (output.pass === true) return true;
  return false;
}

function claimCurrent(output) {
  if (!output || typeof output !== "object") return false;
  if (output.claimedCurrent === true || output.isCurrent === true || output.current === true)
    return true;
  if (output.catalogCurrent === true || output.treatStaleAsCurrent === true) return true;
  if (output.asCurrent === true || output.liveCatalog === true) return true;
  if (output.previousAsCurrent === true) return true;
  if (typeof output.currentVersion === "string" && output.currentVersion === output.version)
    return true;
  return false;
}

function normSha(s) {
  if (typeof s !== "string") return null;
  const t = s.replace(/^sha256:/i, "").toLowerCase();
  return /^[0-9a-f]{64}$/.test(t) ? t : null;
}

function normBytes(v) {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && /^\d+$/.test(v.trim())) return Number(v.trim());
  return null;
}

function compareSemver(a, b) {
  const pa = String(a)
    .split(".")
    .map((x) => parseInt(x, 10) || 0);
  const pb = String(b)
    .split(".")
    .map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

function identityFrom(output) {
  return {
    version:
      output.version ||
      output.pin?.version ||
      output.archive?.version ||
      output.result?.version ||
      null,
    sha256:
      normSha(output.sha256) ||
      normSha(output.pin?.sha256) ||
      normSha(output.digest) ||
      normSha(output.archive?.sha256) ||
      normSha(output.result?.sha256) ||
      null,
    bytes: normBytes(
      output.bytes ?? output.pin?.bytes ?? output.archive?.bytes ?? output.result?.bytes,
    ),
  };
}

/**
 * @param {object} output
 * @param {object} [meta]
 * @returns {{ reject: boolean, staleAsCurrent: boolean, reasons: string[], detail: object }}
 */
export function classifyStaleArchive(output, meta = {}) {
  const kit = meta.kit || readKitPin();
  const current = {
    version: kit.version || EXPECTED_CURRENT.version,
    sha256: kit.sha256 || EXPECTED_CURRENT.sha256,
    bytes: kit.bytes || EXPECTED_CURRENT.bytes,
  };
  const staleMap = meta.stale || stalePinsFromKit(kit);
  const staleList = Object.values(staleMap);
  const observed = identityFrom(output || {});
  const success = claimSuccess(output);
  const currentClaim = claimCurrent(output);
  const reasons = [];
  const identityReasons = [];
  const detail = {
    claimedSuccess: success,
    claimedCurrent: currentClaim,
    observed,
    current,
    principle: PRINCIPLE,
    surface: meta.surface || output?.surface || "useful-jobs-archive",
    probe: meta.probe
      ? {
          ok: meta.probe.ok,
          refused: meta.probe.refused,
          code: meta.probe.code || null,
        }
      : null,
  };

  if (output?.treatStaleAsCurrent === true) {
    reasons.push("treat_stale_as_current");
  }
  if (output?.previousAsCurrent === true) {
    identityReasons.push("previous_listed_as_current");
  }

  if (observed.version && observed.version !== current.version) {
    const knownStale = Boolean(staleMap[observed.version]);
    const older = compareSemver(observed.version, current.version) < 0;
    if (knownStale || older) identityReasons.push("stale_version");
  }

  if (observed.sha256 && observed.sha256 !== current.sha256) {
    const knownStale = staleList.some((p) => p.sha256 === observed.sha256);
    if (knownStale) identityReasons.push("stale_sha");
    else identityReasons.push("sha_mismatch");
  }

  if (typeof observed.bytes === "number" && observed.bytes !== current.bytes) {
    const knownStale = staleList.some((p) => p.bytes === observed.bytes);
    if (knownStale) identityReasons.push("stale_bytes");
    else identityReasons.push("bytes_mismatch");
  }

  if (observed.version === NEGATIVE_CONTROL_VERSION) {
    identityReasons.push("negative_control_110");
  }

  if (output?.fabricatedDigest === true || output?.stampSource === "fabricated") {
    identityReasons.push("fabricated_digest");
  }
  if (
    observed.sha256 &&
    observed.sha256 !== current.sha256 &&
    !staleList.some((p) => p.sha256 === observed.sha256)
  ) {
    if (success || currentClaim) identityReasons.push("fabricated_digest");
  }

  const probe = meta.probe;
  if (probe && probe.refused === true) {
    identityReasons.push("product_refuse");
    if (probe.code === "wrong-size") identityReasons.push("stale_bytes");
    if (probe.code === "wrong-digest") identityReasons.push("stale_sha");
  }

  const staleIdentity = identityReasons.length > 0;
  const treatsAsCurrent = success || currentClaim || output?.treatStaleAsCurrent === true;

  if (staleIdentity && treatsAsCurrent) {
    reasons.push(...identityReasons);
  } else if (output?.treatStaleAsCurrent === true) {
    reasons.push(...identityReasons);
  }

  const unique = [...new Set(reasons)];
  const reject = unique.length > 0;
  const staleAsCurrent = reject;

  if (staleAsCurrent && !unique.includes("stale_as_current")) {
    unique.unshift("stale_as_current");
  }
  if (staleAsCurrent && !unique.includes("stale_archive")) {
    unique.unshift("stale_archive");
  }

  return {
    reject,
    staleAsCurrent,
    reasons: unique,
    detail,
  };
}

export { claimSuccess, claimCurrent, identityFrom };
