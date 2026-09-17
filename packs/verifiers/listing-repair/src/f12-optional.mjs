import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const F12_INDEX = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "verifier-counterexamples",
  "src",
  "index.mjs",
);

export function f12CorpusPath() {
  return F12_INDEX;
}

export function f12CorpusPresent() {
  return existsSync(F12_INDEX);
}
