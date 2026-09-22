import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const PACK = join(dirname(fileURLToPath(import.meta.url)), "..");
export const REPO = join(PACK, "../../..");
export const FIXTURES = join(PACK, "fixtures");
export const SEEDED_FIXTURES = join(FIXTURES, "seeded");

export const ENGINE_CLASSIFY = "server/lib/observatory/contract.js#classifyProviderTimestamp";
export const ENGINE_MARKET = "server/routes/market-observations.js#refineSourceTimeState";
export const ENGINE_MOLTJOBS = "server/lib/observatory/adapters/moltjobs.js#observe";
export const ENGINE_X402STATS = "server/lib/observatory/adapters/x402stats.js#observe";

export const SEEDED_FAILURE_IDS = Object.freeze([
  "future-as-ok",
  "stale-as-fresh-zero",
  "collapse-clocks",
  "payment-to-correct-clock",
  "market-obs-boundary-as-stale",
]);

export function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function fixture(name) {
  return readJson(join(FIXTURES, name));
}

export function seededFixture(name) {
  return readJson(join(SEEDED_FIXTURES, name));
}

export function seededFixtureNames() {
  return readdirSync(SEEDED_FIXTURES).filter((name) => name.endsWith(".json")).sort();
}
