import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const LIB = dirname(fileURLToPath(import.meta.url));

export const CORPUS_ROOT = join(LIB, "..");
export const REPO_ROOT = join(CORPUS_ROOT, "..", "..", "..");
export const WRITE_BOUNDARY = "tests/regression-sds/w902-absence/**";
export const FEATURE = "absence-not-demand-w902";
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
    "Documented-unavailable sources, refused conversion ratios, non-additive snapshots, missing-not-zero metrics, empty pulse tool maps, GET /mcp surface hits, owner-QA issues, catalog counts, unpaid 402 traces, and discovery snapshots are not market or paid demand. Unavailable, partial, empty, and stale are not zeros and are not demand.",
});
