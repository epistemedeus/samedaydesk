import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

export const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(HERE, "..");
export const REPO_ROOT = join(ROOT, "../../..");
export const PINS_PATH = join(ROOT, "pins.json");

export function loadPins() {
  return JSON.parse(readFileSync(PINS_PATH, "utf8"));
}

export function fixtureDir(id) {
  return join(ROOT, "fixtures", id);
}

export function expectedPath(id) {
  return join(ROOT, "fixtures", id, "expected.json");
}

export function inTreeArchive(pins = loadPins()) {
  return join(REPO_ROOT, pins.released.inTreeArchive);
}

export function inTreePin(pins = loadPins()) {
  return join(REPO_ROOT, pins.released.inTreePin);
}
