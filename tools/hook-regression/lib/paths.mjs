import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

export const PACK_ROOT = join(here, "..");
export const SDS_ROOT = join(PACK_ROOT, "../..");
export const FIXTURES_DIR = join(PACK_ROOT, "fixtures");
export const LIB_DIR = join(PACK_ROOT, "lib");
export const BIN_DIR = join(PACK_ROOT, "bin");
export const TEST_DIR = join(PACK_ROOT, "test");

export const H4_OWNED_DIR = "experiments/cursor-wave-20260911/h4-precise-repairs";
export const H4_WORKSPACE = join(SDS_ROOT, H4_OWNED_DIR);
export const H4_BRANCH = "fable/h4-precise-repairs";
export const H4_GIT_PREFIX = `${H4_OWNED_DIR}`;

export const SDS_VERIFIED_FEED = join(SDS_ROOT, "client/public/x402/verified.json");
export const SDS_PRICING = join(SDS_ROOT, "server/pricing.js");
