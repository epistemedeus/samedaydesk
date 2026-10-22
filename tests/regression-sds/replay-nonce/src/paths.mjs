import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const PACK = join(dirname(fileURLToPath(import.meta.url)), "..");
export const REPO = join(PACK, "../../..");
export const FIXTURES = join(PACK, "fixtures");

export const ENGINE_STORE = "server/lib/pulse-store/supabase-adapter.js#createPulseStoreFromTransport";
export const ENGINE_AUTHORITY = "server/scripts/helpers/fake-pulse-authority.js#createFakePulseAuthority";
export const ENGINE_WAL = "server/lib/pulse-store/wal-schema.js#validateWalFlushEntry";
export const ENGINE_FALLBACK = "server/lib/pulse-store/file-fallback.js#createFileFallbackStore";
export const ENGINE_SQL = "supabase/migrations/0002_pulse_durable.sql#pulse_apply_delta";

export function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function fixture(name) {
  return readJson(join(FIXTURES, name));
}

export function seededFixture(name) {
  return readJson(join(FIXTURES, "seeded", name));
}
