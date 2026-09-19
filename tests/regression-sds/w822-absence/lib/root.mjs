import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const LIB = dirname(fileURLToPath(import.meta.url));

export const CORPUS_ROOT = join(LIB, "..");
export const REPO_ROOT = join(CORPUS_ROOT, "..", "..", "..");
export const WRITE_BOUNDARY = "tests/regression-sds/w822-absence/**";
export const FEATURE = "absence-not-demand-w822";
export const BOUNDARY = Object.freeze({
  paymentSent: false,
  stripeOrX402: false,
  neoPublish: false,
  liveFetch: false,
  write: WRITE_BOUNDARY,
});
export const PRINCIPLE = Object.freeze({
  id: "absence-not-demand",
  statement:
    "Documented-unavailable sources, refused conversion ratios, non-additive snapshots, missing-not-zero metrics, scoped no-change, presence snapshots, and unpaid 402 traces are not market or paid demand. Unavailable, partial, empty, and stale are not zeros and are not demand.",
});
