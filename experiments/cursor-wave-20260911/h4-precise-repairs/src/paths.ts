import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

export const PACK_ROOT = join(here, "..");
export const REPO_ROOT = join(PACK_ROOT, "../../..");
export const FIXTURES_DIR = join(PACK_ROOT, "fixtures");
export const MERCHANT_FIXTURE = join(
  FIXTURES_DIR,
  "merchant-pr54/indexing-payload-continuity.mjs",
);
export const SDS_CATALOG = join(
  REPO_ROOT,
  "client/public/for-agents/useful-jobs/catalog.json",
);
export const SDS_VERIFIED_FEED = join(REPO_ROOT, "client/public/x402/verified.json");
export const SDS_PRICING = join(REPO_ROOT, "server/pricing.js");
export const EXAMPLE_MISMATCH = join(FIXTURES_DIR, "mismatch-missing-resource.json");
