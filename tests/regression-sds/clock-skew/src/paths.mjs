import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const PACK = join(dirname(fileURLToPath(import.meta.url)), "..");
export const REPO = join(PACK, "../../..");
export const FIXTURES = join(PACK, "fixtures");

export const ENGINE_CLASSIFY = "server/lib/observatory/contract.js#classifyProviderTimestamp";
export const ENGINE_MARKET = "server/routes/market-observations.js#refineSourceTimeState";
export const ENGINE_MOLTJOBS = "server/lib/observatory/adapters/moltjobs.js#observe";
export const ENGINE_X402STATS = "server/lib/observatory/adapters/x402stats.js#observe";

export function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function fixture(name) {
  return readJson(join(FIXTURES, name));
}

export function seededFixture(name) {
  return readJson(join(FIXTURES, "seeded", name));
}
