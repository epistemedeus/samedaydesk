import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { CORPUS_ROOT } from "./root.mjs";

const FIXTURES_ROOT = resolve(CORPUS_ROOT, "fixtures");

export function loadManifest() {
  return JSON.parse(readFileSync(join(CORPUS_ROOT, "MANIFEST.json"), "utf8"));
}

function fail(code, message) {
  const err = new Error(message);
  err.code = code;
  throw err;
}

export function loadFixture(rel) {
  const abs = resolve(CORPUS_ROOT, rel);
  if (abs !== FIXTURES_ROOT && !abs.startsWith(`${FIXTURES_ROOT}/`)) {
    fail("FIXTURE_ESCAPE", `fixture path escapes fixtures/: ${rel}`);
  }
  if (extname(abs) !== ".json") {
    fail("FIXTURE_INVALID", `fixture must be a .json file: ${rel}`);
  }
  if (!existsSync(abs) || !statSync(abs).isFile()) {
    fail("FIXTURE_MISSING", `fixture missing: ${rel}`);
  }
  const real = realpathSync(abs);
  if (real !== FIXTURES_ROOT && !real.startsWith(`${FIXTURES_ROOT}/`)) {
    fail("FIXTURE_ESCAPE", `fixture realpath escapes fixtures/: ${rel}`);
  }
  let raw;
  try {
    raw = JSON.parse(readFileSync(abs, "utf8"));
  } catch {
    fail("FIXTURE_INVALID", `fixture is not JSON: ${rel}`);
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    fail("FIXTURE_INVALID", `fixture must be a JSON object: ${rel}`);
  }
  return { abs, rel, raw };
}

export function listCaseFiles() {
  const dir = join(CORPUS_ROOT, "fixtures/cases");
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => join("fixtures/cases", name));
}
