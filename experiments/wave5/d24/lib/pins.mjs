import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const D24_ROOT = join(here, "..");
export const PINS = JSON.parse(readFileSync(join(D24_ROOT, "PINS.json"), "utf8"));

export const EXECUTION_CONTRACT = PINS.contracts.d01;
export const EXPORT_SCHEMA = PINS.contracts.d07;
export const ARCHIVE_SHA256 = PINS.archive.sha256;
export const ARCHIVE_BYTES = PINS.archive.bytes;

export function sdsRepoRootFromHere() {
  return join(here, "../../../..");
}
