import test from "node:test";
import assert from "node:assert/strict";
import { applyRosterRename, evidenceX, handbackDecision } from "../inputs.mjs";

const SAMPLE_DECISION = "Applied implementation X rename to implementation Y row SYN-Y-441. workerId SYN-Y-441 windowLabel late.";

test("handback decision names the applied worker row", () => {
  const applied = applyRosterRename(evidenceX(), {
    crew_code: "SYN-Z-902",
    shift_window: "mid",
    dock: "south",
  });
  assert.deepEqual(applied.applied, { workerId: "SYN-Z-902", windowLabel: "mid" });
  const decision = handbackDecision(applied.applied);
  assert.equal(decision.includes("row SYN-Z-902"), true, decision);
  assert.equal(decision.includes("SYN-Y-441"), false, decision);
  assert.equal(decision.includes("windowLabel mid"), true, decision);

  const sample = applyRosterRename(evidenceX(), {
    crew_code: "SYN-Y-441",
    shift_window: "late",
    dock: "north",
  });
  assert.equal(handbackDecision(sample.applied), SAMPLE_DECISION);
});
