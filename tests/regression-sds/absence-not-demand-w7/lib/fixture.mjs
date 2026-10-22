import { readFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const PACK_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const FIXTURES_ROOT = resolve(PACK_ROOT, "fixtures");

export const ALLOWED_FIXTURE_KEYS = Object.freeze([
  "id",
  "surface",
  "class",
  "seededAbsenceAsDemand",
  "expectReject",
  "expectedReasons",
  "defect",
  "output",
  "absence",
  "paidActivity",
  "evidence",
]);

export function fixtureError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

export function resolveFixturePath(pathArg) {
  if (typeof pathArg !== "string" || pathArg.length === 0) {
    throw fixtureError("USAGE", "missing --fixture value");
  }
  const abs = resolve(PACK_ROOT, pathArg);
  const rel = relative(FIXTURES_ROOT, abs);
  if (rel === "" || isAbsolute(rel) || rel.startsWith("..")) {
    throw fixtureError("FIXTURE_OUTSIDE", `fixture outside fixtures tree: ${pathArg}`);
  }
  return abs;
}

export function loadFixture(pathArg) {
  const abs = resolveFixturePath(pathArg);
  let raw;
  try {
    raw = JSON.parse(readFileSync(abs, "utf8"));
  } catch (e) {
    if (e && e.code === "ENOENT") {
      throw fixtureError("FIXTURE_MISSING", `fixture not found: ${pathArg}`);
    }
    throw fixtureError("FIXTURE_INVALID", `invalid fixture JSON: ${e.message}`);
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw fixtureError("FIXTURE_INVALID", "fixture root must be an object");
  }
  const unknown = Object.keys(raw).filter((k) => !ALLOWED_FIXTURE_KEYS.includes(k));
  if (unknown.length) {
    throw fixtureError("FIXTURE_UNKNOWN_FIELD", `unknown field ${unknown.join(",")}`);
  }
  return { abs, raw };
}
