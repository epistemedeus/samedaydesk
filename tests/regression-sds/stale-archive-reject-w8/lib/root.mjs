import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const LIB = dirname(fileURLToPath(import.meta.url));

export const CORPUS_ROOT = join(LIB, "..");
export const REPO_ROOT = join(CORPUS_ROOT, "..", "..", "..");
export const WRITE_BOUNDARY = "tests/regression-sds/stale-archive-reject-w8/**";
export const FEATURE = "stale-archive-reject-w8";

export const BOUNDARY = Object.freeze({
  paymentSent: false,
  stripeOrX402: false,
  neoPublish: false,
  liveFetch: false,
  write: WRITE_BOUNDARY,
});

export const PRINCIPLE = Object.freeze({
  id: "stale-archive-reject",
  statement:
    "A stale useful-jobs archive is not the current catalog. 1.0.0–1.4.0 (1.1.0 is the W0-B2 negative control) must not be accepted as 1.4.7. obtain-archive refuses stale bytes against the current pin; child exit 0 + refused is not a pass.",
});

export const NEGATIVE_CONTROL_VERSION = "1.1.0";

export const OBTAIN_ARCHIVE_REL =
  "experiments/s260-useful-jobs-public-integration/bin/obtain-archive.mjs";

export const REFUSED_FLAGS = Object.freeze([
  "--live",
  "--pay",
  "--stripe",
  "--publish",
  "--neo",
  "--x402",
]);
