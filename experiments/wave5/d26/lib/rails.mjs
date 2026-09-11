import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ERROR_CODES, RAILS_DIR, STRIPE_RAIL_ID, X402_RAIL_ID } from "./pins.mjs";
import { throwRefuse } from "./refuse.mjs";

const cache = new Map();

export function loadRail(id) {
  if (cache.has(id)) return cache.get(id);
  const path = join(RAILS_DIR, `${id}.json`);
  let raw;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throwRefuse(ERROR_CODES.UNKNOWN_RAIL, `unknown rail ${id}`);
  }
  if (raw.id !== id) throwRefuse(ERROR_CODES.UNKNOWN_RAIL, `rail file id ${raw.id} != ${id}`);
  cache.set(id, Object.freeze(raw));
  return cache.get(id);
}

export function listRails() {
  return readdirSync(RAILS_DIR)
    .filter((name) => name.endsWith(".json"))
    .map((name) => loadRail(name.slice(0, -5)));
}

export function x402Rail() {
  return loadRail(X402_RAIL_ID);
}

export function stripeRail() {
  return loadRail(STRIPE_RAIL_ID);
}
