import { existsSync, readFileSync } from "node:fs";
import { comparableBaseline } from "./truth.mjs";

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((k) => [k, sortKeys(value[k])]));
  }
  return value;
}

export function canonical(value) {
  return `${JSON.stringify(sortKeys(value))}\n`;
}

export function loadExpected(path) {
  if (!existsSync(path)) return null;
  const raw = JSON.parse(readFileSync(path, "utf8"));
  const { schema, id, notes, ...rest } = raw;
  return { raw, view: comparableBaseline(rest) };
}

export function compareBaseline(actualView, expectedPath) {
  const expected = loadExpected(expectedPath);
  const actual = comparableBaseline(actualView);
  if (!expected) {
    return {
      compared: false,
      matched: false,
      path: expectedPath,
      updated: false,
      reason: "missing-baseline",
      actual,
    };
  }
  const matched = canonical(actual) === canonical(expected.view);
  return {
    compared: true,
    matched,
    path: expectedPath,
    updated: false,
    actual,
    expected: expected.view,
  };
}

export function refuseBaselineUpdate() {
  return {
    updated: false,
    allowed: false,
    note: "Baselines are reviewable files. This runner never writes expected.json, including on mismatch.",
  };
}
