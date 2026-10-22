/**
 * Classify useful-jobs / listing / verify output for stale or greenwashed claims.
 * Greenwash = claims ok/pass/success while version/sha/bytes/stamp is not the live pin.
 */
import { CURRENT_PIN, STALE_PINS, knownStaleSha } from "./pin.mjs";

const STALE_VERSIONS = new Set(Object.keys(STALE_PINS));

export function claimSuccess(output) {
  if (!output || typeof output !== "object") return false;
  if (output.ok === true) return true;
  if (output.status === "pass" || output.status === "ok" || output.status === "success") return true;
  if (output.verdict === "pass" || output.verdict === "accept") return true;
  if (output.pass === true) return true;
  return false;
}

export function normSha(s) {
  if (typeof s !== "string") return null;
  const t = s.replace(/^sha256:/i, "").toLowerCase();
  return /^[0-9a-f]{64}$/.test(t) ? t : null;
}

function firstDefined(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return null;
}

function compareSemver(a, b) {
  const pa = String(a).split(".").map((x) => parseInt(x, 10) || 0);
  const pb = String(b).split(".").map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < 3; i += 1) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

function parseStamp(value) {
  if (!value || typeof value !== "string") return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function surfaceOf(output, meta) {
  return meta.surface || output.surface || output.feature || "unknown";
}

function isUsefulJobs(surface, output) {
  return surface === "useful-jobs" || output.feature === "useful-jobs";
}

function isListing(surface, output) {
  return surface === "listing" || output.surface === "listing" || output.feature === "listing-repair";
}

function claimsFreshness(output, freshStamp, stampSource) {
  if (output.fabricatedFresh === true) return true;
  if (stampSource === "fabricated") return true;
  if (output.freshness?.claimed === true) return true;
  return Boolean(freshStamp);
}

/**
 * @param {object} output claimed product/verify/listing output
 * @param {object} [meta]
 * @returns {{ reject: boolean, greenwash: boolean, reasons: string[], detail: object }}
 */
export function classifyStaleOutput(output, meta = {}) {
  const reasons = [];
  const surface = surfaceOf(output, meta);
  const detail = {
    claimedSuccess: claimSuccess(output),
    pin: {
      version: CURRENT_PIN.version,
      sha256: CURRENT_PIN.sha256,
      bytes: CURRENT_PIN.bytes,
      builtAt: CURRENT_PIN.builtAt,
    },
    surface,
  };

  const version = firstDefined(
    output.version,
    output.pin?.version,
    output.result?.version,
    output.kit?.version,
  );
  const sha = firstDefined(
    normSha(output.sha256),
    normSha(output.pin?.sha256),
    normSha(output.result?.sha256),
    normSha(output.digest),
    normSha(output.sourceObservation?.digest),
  );
  const bytes = firstDefined(output.bytes, output.pin?.bytes, output.result?.bytes);
  const freshStamp = firstDefined(
    output.freshStamp,
    output.freshAt,
    output.fabricatedFreshAt,
    output.freshness?.at,
  );
  const observedAt = firstDefined(
    output.observedAt,
    output.asOf,
    output.sourceObservation?.observedAt,
  );
  const stampSource = firstDefined(output.stampSource, output.freshness?.source);

  detail.observed = { version, sha256: sha, bytes, freshStamp, observedAt, stampSource };

  if (version && version !== CURRENT_PIN.version) {
    if (STALE_VERSIONS.has(version) || compareSemver(version, CURRENT_PIN.version) < 0) {
      reasons.push("stale_version");
    }
  }

  if (sha && sha !== CURRENT_PIN.sha256) {
    reasons.push(knownStaleSha(sha) ? "stale_sha" : "sha_mismatch");
  }

  if (version === CURRENT_PIN.version && sha && sha !== CURRENT_PIN.sha256) {
    reasons.push("version_sha_conflict");
  }

  if (isUsefulJobs(surface, output) && typeof bytes === "number" && bytes !== CURRENT_PIN.bytes) {
    reasons.push("stale_bytes");
  }

  if (claimsFreshness(output, freshStamp, stampSource)) {
    const pinMatches = sha === CURRENT_PIN.sha256 && (!version || version === CURRENT_PIN.version);
    if (!pinMatches) reasons.push("fabricated_fresh_stamp");
  }

  if (isListing(surface, output)) {
    const expected = normSha(output.expectedDigest) || CURRENT_PIN.sha256;
    const got = firstDefined(
      normSha(output.sourceObservation?.digest),
      normSha(output.digest),
      sha,
    );
    if ((got && got !== expected) || (got && got !== CURRENT_PIN.sha256) || (expected && expected !== CURRENT_PIN.sha256)) {
      reasons.push("stale_listing_digest");
    }
    const observedMs = parseStamp(observedAt);
    const builtMs = parseStamp(CURRENT_PIN.builtAt);
    if (observedMs != null && builtMs != null && observedMs < builtMs) {
      reasons.push("stale_observed_at");
    }
  }

  const unique = [...new Set(reasons)];
  const reject = unique.length > 0;
  const greenwash = reject && detail.claimedSuccess;
  if (greenwash) unique.unshift("greenwash");

  return { reject, greenwash, reasons: unique, detail };
}
