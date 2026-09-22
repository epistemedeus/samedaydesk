import assert from "node:assert/strict";
import test from "node:test";
import {
  SOURCE_TIME_STALE_MS,
  compileRefineSourceTimeState,
  extractNumericConst,
  isNumericLiteralExpr,
  refineSourceTimeState,
} from "../src/engine.mjs";

test("published SOURCE_TIME_STALE_MS is a numeric literal expression", () => {
  assert.equal(SOURCE_TIME_STALE_MS, 60 * 60 * 1000);
  assert.equal(isNumericLiteralExpr("60 * 60 * 1000"), true);
  assert.equal(isNumericLiteralExpr("process.env.STALE || 3600000"), false);
});

test("extractNumericConst refuses process.env / identifier expressions", () => {
  const drifted = "export const SOURCE_TIME_STALE_MS = process.env.STALE || 3600000;\n";
  assert.throws(
    () => extractNumericConst(drifted, "SOURCE_TIME_STALE_MS", "fixture"),
    /numeric literal expression/,
  );
});

test("extractNumericConst refuses Function-visible process identifiers", () => {
  const drifted = "export const SOURCE_TIME_STALE_MS = typeof process !== 'undefined' ? 1 : 3600000;\n";
  assert.throws(
    () => extractNumericConst(drifted, "SOURCE_TIME_STALE_MS", "fixture"),
    /numeric literal expression/,
  );
});

test("refineSourceTimeState sandbox does not see process", () => {
  const source = `export function refineSourceTimeState(sourceTime, fetchedAt, currentState) {
  return typeof process;
}`;
  const compiled = compileRefineSourceTimeState(source, SOURCE_TIME_STALE_MS, "fixture");
  assert.equal(compiled("2026-09-17T11:00:00.000Z", "2026-09-17T12:00:00.000Z", "ok"), "undefined");
});

test("compiled refine still keeps exact SOURCE_TIME_STALE_MS as ok", () => {
  assert.equal(
    refineSourceTimeState("2026-09-17T11:00:00.000Z", "2026-09-17T12:00:00.000Z", "ok"),
    "ok",
  );
  assert.equal(
    refineSourceTimeState("2026-09-17T10:59:59.000Z", "2026-09-17T12:00:00.000Z", "ok"),
    "stale",
  );
});
