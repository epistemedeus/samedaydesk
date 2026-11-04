// Independent case: handbackDecision on a row other than the prototype sample.
// Runs against the received CONTRIB pin and does not edit it.
import assert from "node:assert/strict";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { join } from "node:path";

const pin = process.env.AGL_CONTRIB_ROOT;
if (!pin) throw new Error("AGL_CONTRIB_ROOT is required");

const { applyRosterRename, evidenceX, handbackDecision } = await import(
  pathToFileURL(join(pin, "experiments/agl-contribution-delegation-20261104/inputs.mjs")).href
);

test("handback decision names the applied row rather than a hardcoded sample", () => {
  const row = {
    crew_code: "SYN-Z-902",
    shift_window: "mid",
    dock: "south",
  };
  const applied = applyRosterRename(evidenceX(), row);
  assert.deepEqual(applied.applied, {
    workerId: "SYN-Z-902",
    windowLabel: "mid",
  });
  const decision = handbackDecision(applied.applied);
  assert.equal(decision.includes("row SYN-Z-902"), true, decision);
  assert.equal(decision.includes("SYN-Y-441"), false, decision);
  assert.equal(decision.includes("windowLabel mid"), true, decision);
});
