import test from "node:test";
import assert from "node:assert/strict";
import { nextBusinessMorning, addBusinessDays, isBusinessDay } from "../server/lib/clock.js";

test("weekends are not business days", () => {
  assert.equal(isBusinessDay("2026-08-22", "Sat"), false);
  assert.equal(isBusinessDay("2026-08-23", "Sun"), false);
  assert.equal(isBusinessDay("2026-08-24", "Mon"), true);
});

test("US federal holidays are not business days", () => {
  assert.equal(isBusinessDay("2026-11-26", "Thu"), false);
  assert.equal(isBusinessDay("2026-12-25", "Fri"), false);
});

test("the clock starts the next business morning", () => {
  assert.equal(nextBusinessMorning(new Date("2026-08-19T20:00:00Z")), "2026-08-20");
  assert.equal(nextBusinessMorning(new Date("2026-08-21T20:00:00Z")), "2026-08-24");
});

test("business days skip weekends and holidays", () => {
  assert.equal(addBusinessDays("2026-08-20", 5), "2026-08-26");
  assert.equal(addBusinessDays("2026-08-20", 15), "2026-09-10");
  assert.equal(addBusinessDays("2026-11-25", 3), "2026-11-30");
});
