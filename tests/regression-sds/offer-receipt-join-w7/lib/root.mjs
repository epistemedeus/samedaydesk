import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

export const PACK_ROOT = join(here, "..");
export const REPO_ROOT = join(PACK_ROOT, "../../..");
export const CASES_DIR = join(PACK_ROOT, "fixtures/cases");
export const PIN_DIR = join(PACK_ROOT, "fixtures/pin");
export const COMMITTED_X402 = join(REPO_ROOT, "fixtures/presence/catalog/x402.json");
export const COMMITTED_BUYER_CATALOG = join(REPO_ROOT, "fixtures/buyer-runtimes/catalog.json");
export const COMMITTED_OBSERVATIONS = join(REPO_ROOT, "data/bazaar-tracker/observations.json");
