import assert from "node:assert/strict";
import test from "node:test";
import { recordRepeatArchivePin, usefulJobsArchivePin } from "../lib/pins.mjs";

test("PR51 useful-jobs archive pin matches committed bytes and sha256", () => {
  const pin = usefulJobsArchivePin();
  assert.equal(pin.ok, true, pin.error || JSON.stringify(pin));
  assert.equal(pin.bytes, 2522418);
  assert.equal(pin.sha256, "6bf650391fad4fa658a7959e9717fc5499faf4caffa0a39f67c6c2ee033bdb51");
});

test("PR51 record-repeat vendor-pin archive matches committed bytes and sha256", () => {
  const pin = recordRepeatArchivePin();
  assert.equal(pin.ok, true, pin.error || JSON.stringify(pin));
  assert.equal(pin.bytes, 1253570);
  assert.equal(pin.sha256, "9814feabcda58c1f4a494a8919d9c6c2ac7d35b094ce5218261f976196c045ea");
});
