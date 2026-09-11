import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const OWNED = join(here, "..");
export const CLI = join(OWNED, "bin/readout.mjs");
export const SERVE = join(OWNED, "bin/serve.mjs");
export const FIXTURES = join(OWNED, "fixtures");

export function readJson(rel) {
  return JSON.parse(readFileSync(join(FIXTURES, rel), "utf8"));
}

export function asObservations(value) {
  if (Array.isArray(value.observations)) return value.observations;
  if (Array.isArray(value)) return value;
  return [value];
}
