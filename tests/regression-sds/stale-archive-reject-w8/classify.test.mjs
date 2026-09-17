import assert from "node:assert/strict";
import test from "node:test";
import { classifyStaleArchive } from "./lib/classify.mjs";
import { EXPECTED_CURRENT } from "./lib/pin.mjs";

test("current 1.4.7 claim is not rejected", () => {
  const v = classifyStaleArchive({
    ok: true,
    claimedCurrent: true,
    version: EXPECTED_CURRENT.version,
    sha256: EXPECTED_CURRENT.sha256,
    bytes: EXPECTED_CURRENT.bytes,
  });
  assert.equal(v.reject, false, JSON.stringify(v.reasons));
});

test("honest 1.1.0 refuse is not a defect", () => {
  const v = classifyStaleArchive({
    ok: false,
    refused: true,
    claimedCurrent: false,
    version: "1.1.0",
    sha256: "de8ebee19ffd5d9019fa7988291fe37d861e7bf3f5ee7dd341c9d2f0f0065534",
    bytes: 2577606,
  });
  assert.equal(v.reject, false, JSON.stringify(v.reasons));
});

test("1.1.0 claimed current is rejected as stale_as_current", () => {
  const v = classifyStaleArchive({
    ok: true,
    claimedCurrent: true,
    treatStaleAsCurrent: true,
    version: "1.1.0",
    sha256: "de8ebee19ffd5d9019fa7988291fe37d861e7bf3f5ee7dd341c9d2f0f0065534",
    bytes: 2577606,
  });
  assert.equal(v.reject, true);
  assert.ok(v.reasons.includes("stale_archive"));
  assert.ok(v.reasons.includes("stale_as_current"));
  assert.ok(v.reasons.includes("negative_control_110"));
});

test("obtain refuse plus success claim adds product_refuse", () => {
  const v = classifyStaleArchive(
    {
      ok: true,
      claimedCurrent: true,
      version: "1.1.0",
      sha256: "de8ebee19ffd5d9019fa7988291fe37d861e7bf3f5ee7dd341c9d2f0f0065534",
      bytes: 2577606,
    },
    { probe: { ok: false, refused: true, code: "wrong-size" } },
  );
  assert.ok(v.reasons.includes("product_refuse"));
  assert.ok(v.reasons.includes("stale_bytes"));
});
