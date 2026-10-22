import assert from "node:assert/strict";
import test from "node:test";
import { evaluateFixture } from "./lib/evaluate.mjs";
import { EXPECTED_CURRENT, loadPins } from "./lib/pin.mjs";

const STALE_110 = {
  version: "1.1.0",
  sha256: "de8ebee19ffd5d9019fa7988291fe37d861e7bf3f5ee7dd341c9d2f0f0065534",
  bytes: 2577606,
};

test("obtain-stale fixture fails closed if the real probe accepts current bytes", () => {
  const pins = loadPins();
  assert.equal(pins.ok, true, JSON.stringify(pins.error));
  const evaluated = evaluateFixture(
    {
      id: "obtain-stale-but-probe-accepted",
      probe: {
        kind: "obtain-archive",
        fromRel: "client/public/for-agents/useful-jobs/useful-jobs-1.4.7.tar.gz",
        expected: "current",
        expectCode: "wrong-size",
      },
      output: {
        ok: true,
        claimedCurrent: true,
        version: STALE_110.version,
        sha256: STALE_110.sha256,
        bytes: STALE_110.bytes,
      },
    },
    "reject",
    pins,
  );
  assert.equal(evaluated.ok, false);
  assert.equal(evaluated.error.code, "PROBE_NOT_REFUSED");
  assert.equal(evaluated.probe.ok, true);
  assert.equal(evaluated.probe.refused, false);
});

test("obtain-current fixture fails if the real probe is a stale 1.1.0 archive", () => {
  const pins = loadPins();
  assert.equal(pins.ok, true, JSON.stringify(pins.error));
  const evaluated = evaluateFixture(
    {
      id: "obtain-current-but-stale-bytes",
      probe: {
        kind: "obtain-archive",
        fromRel: "client/public/for-agents/useful-jobs/useful-jobs-1.1.0.tar.gz",
        expected: "current",
      },
      output: {
        version: EXPECTED_CURRENT.version,
        sha256: EXPECTED_CURRENT.sha256,
        bytes: EXPECTED_CURRENT.bytes,
      },
    },
    "accept",
    pins,
  );
  assert.equal(evaluated.ok, false);
  assert.equal(evaluated.error.code, "PROBE_FAIL");
  assert.equal(evaluated.probe.refused, true);
  assert.equal(evaluated.probe.code, "wrong-size");
  assert.equal(evaluated.probe.childExit, 0);
});

test("obtain-stale wrong-size fixture fails if probe code is not wrong-size", () => {
  const pins = loadPins();
  assert.equal(pins.ok, true, JSON.stringify(pins.error));
  const evaluated = evaluateFixture(
    {
      id: "obtain-stale-code-mismatch",
      probe: {
        kind: "obtain-archive",
        fromRel: "client/public/for-agents/useful-jobs/useful-jobs-1.1.0.tar.gz",
        expected: "override",
        expectedSha256: EXPECTED_CURRENT.sha256,
        expectedBytes: STALE_110.bytes,
        expectCode: "wrong-size",
      },
      output: {
        ok: true,
        claimedCurrent: true,
        version: STALE_110.version,
        sha256: STALE_110.sha256,
        bytes: STALE_110.bytes,
      },
    },
    "reject",
    pins,
  );
  assert.equal(evaluated.ok, false);
  assert.equal(evaluated.error.code, "PROBE_CODE_MISMATCH");
  assert.equal(evaluated.probe.code, "wrong-digest");
});
