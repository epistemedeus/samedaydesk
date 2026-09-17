import assert from "node:assert/strict";
import test from "node:test";
import { classifyStaleOutput } from "./lib/classify.mjs";
import { CURRENT_PIN, STALE_PINS } from "./lib/pin.mjs";

test("honest current pin is accepted", () => {
  const v = classifyStaleOutput(
    {
      ok: true,
      status: "pass",
      feature: "useful-jobs",
      version: CURRENT_PIN.version,
      sha256: CURRENT_PIN.sha256,
      bytes: CURRENT_PIN.bytes,
    },
    { surface: "useful-jobs" },
  );
  assert.equal(v.reject, false);
  assert.equal(v.greenwash, false);
  assert.deepEqual(v.reasons, []);
});

test("stale 1.4.0 pin claiming pass is greenwash", () => {
  const stale = STALE_PINS["1.4.0"];
  const v = classifyStaleOutput(
    {
      ok: true,
      status: "pass",
      feature: "useful-jobs",
      version: stale.version,
      sha256: stale.sha256,
      bytes: stale.bytes,
    },
    { surface: "useful-jobs" },
  );
  assert.equal(v.reject, true);
  assert.equal(v.greenwash, true);
  assert.ok(v.reasons.includes("greenwash"));
  assert.ok(v.reasons.includes("stale_version"));
  assert.ok(v.reasons.includes("stale_sha"));
  assert.ok(v.reasons.includes("stale_bytes"));
});

test("freshness stamp plus wrong sha is fabricated without a self-label", () => {
  const v = classifyStaleOutput(
    {
      ok: true,
      surface: "verify",
      version: CURRENT_PIN.version,
      sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      freshStamp: "2026-09-17T12:00:00.000Z",
    },
    { surface: "verify" },
  );
  assert.equal(v.reject, true);
  assert.ok(v.reasons.includes("fabricated_fresh_stamp"));
  assert.ok(v.reasons.includes("sha_mismatch"));
  assert.ok(!v.reasons.includes("stale_sha"));
});

test("listing digest and observedAt vs pin builtAt, no boolean flags", () => {
  const v = classifyStaleOutput(
    {
      ok: true,
      status: "pass",
      surface: "listing",
      expectedDigest: CURRENT_PIN.sha256,
      digest: STALE_PINS["1.4.0"].sha256,
      sourceObservation: {
        observedAt: "2026-01-01T00:00:00.000Z",
        digest: `sha256:${STALE_PINS["1.4.0"].sha256}`,
      },
    },
    { surface: "listing" },
  );
  assert.equal(v.reject, true);
  assert.ok(v.reasons.includes("stale_listing_digest"));
  assert.ok(v.reasons.includes("stale_observed_at"));
});

test("current listing digest with observedAt after builtAt is not stale", () => {
  const v = classifyStaleOutput(
    {
      ok: true,
      status: "pass",
      surface: "listing",
      expectedDigest: CURRENT_PIN.sha256,
      digest: CURRENT_PIN.sha256,
      sourceObservation: {
        observedAt: "2026-09-16T00:00:00.000Z",
        digest: CURRENT_PIN.sha256,
      },
    },
    { surface: "listing" },
  );
  assert.equal(v.reject, false, JSON.stringify(v.reasons));
});

test("claimed reject-shaped output with stale sha is reject but not greenwash", () => {
  const v = classifyStaleOutput(
    {
      ok: false,
      status: "fail",
      feature: "useful-jobs",
      version: "1.1.0",
      sha256: STALE_PINS["1.1.0"].sha256,
      bytes: STALE_PINS["1.1.0"].bytes,
    },
    { surface: "useful-jobs" },
  );
  assert.equal(v.reject, true);
  assert.equal(v.greenwash, false);
  assert.ok(!v.reasons.includes("greenwash"));
});
