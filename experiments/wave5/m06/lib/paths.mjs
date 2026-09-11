import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const M06_ROOT = join(HERE, "..");
export const REPO_ROOT = join(M06_ROOT, "..", "..", "..");
export const CORPUS_PATH = join(M06_ROOT, "corpus", "cases.json");
export const PIN_PATH = join(M06_ROOT, "PIN.json");
export const REPORT_SCHEMA = "samedaydesk.wave5.m06.schema-compatibility-corpus.v1";

export function loadPin() {
  return JSON.parse(readFileSync(PIN_PATH, "utf8"));
}

export function loadCorpus() {
  const doc = JSON.parse(readFileSync(CORPUS_PATH, "utf8"));
  if (!Array.isArray(doc.cases) || doc.cases.length < 2) {
    throw new Error("corpus must include multiple cases");
  }
  return doc;
}

export function caseById(corpus, id) {
  const found = corpus.cases.find((item) => item.id === id);
  if (!found) throw new Error(`unknown corpus case ${id}`);
  return found;
}

export function exists(path) {
  return existsSync(path);
}
