import { trialRefuse } from "./errors.mjs";

const PROBE_A = { name: "fixture-alpha", version: "1.0.0", integrity: "sha512-aaa" };
const PROBE_B = { name: "fixture-alpha", version: "1.0.0", integrity: "sha512-bbb" };

export function hasherErasesByteDifference(hashPinTerms, a = PROBE_A, b = PROBE_B) {
  if (typeof hashPinTerms !== "function") return true;
  return String(hashPinTerms(a)) === String(hashPinTerms(b));
}

/**
 * Consumer-side guard. The pinned engine still accepts a constant hasher and
 * that wipes integrity/version deltas. This kit refuses to inject such a hasher.
 */
export function assertInjectableHasher(hashPinTerms) {
  if (typeof hashPinTerms !== "function") {
    throw trialRefuse("hasher-not-a-function", "hashPinTerms adapter must be a function");
  }
  if (hasherErasesByteDifference(hashPinTerms)) {
    throw trialRefuse(
      "constant-hasher-erases-byte-equality",
      "injected hasher returns the same digest for different integrity bytes",
      { probeA: PROBE_A, probeB: PROBE_B },
    );
  }
  return hashPinTerms;
}
