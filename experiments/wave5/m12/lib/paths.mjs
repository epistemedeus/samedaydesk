import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

export const M12_DIR = join(here, "..");
export const REPO_ROOT = join(M12_DIR, "../../..");
export const WRAPPER_DIR = join(REPO_ROOT, "server/paid-useful-jobs");
export const WRAPPER_CLI = join(WRAPPER_DIR, "bin/cli.mjs");
export const WRAPPER_INDEX = join(WRAPPER_DIR, "index.mjs");
export const CATALOG_PATH = join(REPO_ROOT, "client/public/for-agents/useful-jobs/catalog.json");
export const OUTCOMES_PATH = join(REPO_ROOT, "client/public/for-agents/useful-jobs/jobs-outcomes.json");
export const DISCOVERY_PATH = join(REPO_ROOT, "client/public/discovery/useful-jobs.json");
export const BUYER_CATALOG_PATH = join(REPO_ROOT, "fixtures/buyer-runtimes/catalog.json");
export const MCP_PATH = join(REPO_ROOT, "client/src/pages/Mcp.tsx");
export const OPENAPI_PATH = join(REPO_ROOT, "fixtures/presence/catalog/openapi.json");
export const M01_DEFAULT = join(REPO_ROOT, "experiments/wave5/m01/selected-offer.json");
export const D26_DEFAULT = join(REPO_ROOT, "experiments/wave5/d26/cost-floor.json");
