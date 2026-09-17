/**
 * Classify useful-jobs / listing / verify output for stale or greenwashed claims.
 * Greenwash = claims ok/pass/success while pin/version/sha/stamp is stale or fabricated.
 */
import { CURRENT_PIN, STALE_PINS } from "./pin.mjs";

const STALE_VERSIONS = new Set(Object.keys(STALE_PINS));

function claimSuccess(output) {
  if (!output || typeof output !== "object") return false;
  if (output.ok === true) return true;
  if (output.status === "pass" || output.status === "ok" || output.status === "success")
    return true;
  if (output.verdict === "pass" || output.verdict === "accept") return true;
  if (output.pass === true) return true;
  return false;
}

function normSha(s) {
  if (typeof s !== "string") return null;
  const t = s.replace(/^sha256:/i, "").toLowerCase();
  return /^[0-9a-f]{64}$/.test(t) ? t : null;
}

/**
 * @param {object} output - claimed product/verify/listing output
 * @param {object} [meta] - fixture meta (surface, expectedReasons)
 * @returns {{ reject: boolean, greenwash: boolean, reasons: string[], detail: object }}
 */
export function classifyStaleOutput(output, meta = {}) {
  const reasons = [];
  const detail = {
    claimedSuccess: claimSuccess(output),
    pin: { ...CURRENT_PIN },
    surface: meta.surface || output.surface || "unknown",
  };

  const version =
    output.version ||
    output.pin?.version ||
    output.result?.version ||
    output.kit?.version ||
    null;
  const sha =
    normSha(output.sha256) ||
    normSha(output.pin?.sha256) ||
    normSha(output.result?.sha256) ||
    normSha(output.digest) ||
    normSha(output.sourceObservation?.digest) ||
    null;
  const bytes =
    output.bytes ??
    output.pin?.bytes ??
    output.result?.bytes ??
    null;
  const freshStamp =
    output.freshStamp ||
    output.freshAt ||
    output.fabricatedFreshAt ||
    null;
  const observedAt =
    output.observedAt ||
    output.asOf ||
    output.sourceObservation?.observedAt ||
    null;
  const stampSource = output.stampSource || output.freshness?.source || null;

  detail.observed = { version, sha256: sha, bytes, freshStamp, observedAt, stampSource };

  // Stale version relative to current pin
  if (version && version !== CURRENT_PIN.version) {
    if (STALE_VERSIONS.has(version) || compareSemver(version, CURRENT_PIN.version) < 0) {
      reasons.push("stale_version");
    }
  }

  // Sha not equal to current pin
  if (sha && sha !== CURRENT_PIN.sha256) {
    const knownStale = Object.values(STALE_PINS).some((p) => p.sha256 === sha);
    if (knownStale) reasons.push("stale_sha");
    else reasons.push("sha_mismatch");
  }

  // Bytes mismatch with current pin when claiming useful-jobs acquire/verify
  if (
    (meta.surface === "useful-jobs" || output.feature === "useful-jobs") &&
    typeof bytes === "number" &&
    bytes !== CURRENT_PIN.bytes
  ) {
    reasons.push("stale_bytes");
  }

  // Fabricated fresh stamp: claims freshness without matching current pin
  if (output.fabricatedFresh === true || stampSource === "fabricated") {
    reasons.push("fabricated_fresh_stamp");
  }
  if (
    freshStamp &&
    (sha !== CURRENT_PIN.sha256 || (version && version !== CURRENT_PIN.version))
  ) {
    if (!reasons.includes("fabricated_fresh_stamp")) {
      reasons.push("fabricated_fresh_stamp");
    }
  }

  // Listing: source digest stale vs declared expectedDigest / pin
  if (meta.surface === "listing" || output.surface === "listing") {
    const expected = normSha(output.expectedDigest) || CURRENT_PIN.sha256;
    const got =
      normSha(output.sourceObservation?.digest) ||
      normSha(output.digest) ||
      sha;
    if (got && expected && got !== expected) {
      reasons.push("stale_listing_digest");
    }
    if (output.observedAtSkew === "stale" || output.staleObservedAt === true) {
      reasons.push("stale_observed_at");
    }
  }

  // Verify surface: outdated sha claimed as pass
  if (meta.surface === "verify" || output.surface === "verify") {
    if (sha && sha !== CURRENT_PIN.sha256) {
      if (!reasons.includes("stale_sha") && !reasons.includes("sha_mismatch")) {
        reasons.push("stale_sha");
      }
    }
  }

  const unique = [...new Set(reasons)];
  const reject = unique.length > 0;
  const greenwash = reject && claimSuccess(output);

  if (greenwash) {
    unique.unshift("greenwash");
  }

  return {
    reject,
    greenwash,
    reasons: unique,
    detail,
  };
}

/** Naive semver compare major.minor.patch; non-semver → -1 if !== current. */
function compareSemver(a, b) {
  const pa = String(a).split(".").map((x) => parseInt(x, 10) || 0);
  const pb = String(b).split(".").map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

export { claimSuccess };
