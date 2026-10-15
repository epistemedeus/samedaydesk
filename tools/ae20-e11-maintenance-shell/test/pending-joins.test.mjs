import assert from "node:assert/strict";
import test from "node:test";
import { runMaintenanceShell } from "../src/occurrence.mjs";
import { LATER_CONSUMER, PENDING_JOINS } from "../src/pending.mjs";
import { PINS } from "../src/pins.mjs";
import { shellInput } from "./support.mjs";

test("pending joins name the terminal G2 export and the later consumers", () => {
  assert.equal(LATER_CONSUMER, "J2 maintained-applicability step");
  assert.equal(PINS.laterConsumer, LATER_CONSUMER);
  assert.deepEqual(PENDING_JOINS, PINS.pendingJoins);
  const terminal = PENDING_JOINS.find((row) => row.id === "g2-terminal-export");
  const reader = PENDING_JOINS.find((row) => row.id === "e21-contribution-handback-reader");
  assert.equal(terminal.pin, "016b38838d1fcc66128e000f39487d044dc497be");
  assert.match(terminal.waitsOn, /codex\/ae14-j2-work-network-composition@016b38838d1fcc66128e000f39487d044dc497be/);
  assert.match(terminal.waitsOn, /codex\/ae14-e21-contribution-handback@2db38faab2f79cd7b3dc3110c54d301834c9611b/);
  assert.match(terminal.waitsOn, /agentInterface\.reuse/);
  assert.match(terminal.waitsOn, /readCurrent/);
  assert.equal(terminal.laterConsumer, "J2 maintained-applicability step");
  assert.equal(reader.pin, "2db38faab2f79cd7b3dc3110c54d301834c9611b");
  assert.match(reader.waitsOn, /codex\/ae14-e21-contribution-handback@2db38faab2f79cd7b3dc3110c54d301834c9611b/);
  assert.match(reader.waitsOn, /agent\.mjs#agentInterface\.reuse/);
  assert.equal(reader.laterConsumer, "E21 contribution handback reader");
  const admitted = runMaintenanceShell(shellInput());
  assert.deepEqual(admitted.pendingJoins, PENDING_JOINS.map((row) => ({ ...row })));
  assert.equal(admitted.hJoin, "pending-join");
});

for (const join of PENDING_JOINS) {
  test(`pending-join ${join.id}`, {
    skip: `pending-join waitsOn ${join.waitsOn} pin ${join.pin} laterConsumer ${join.laterConsumer}`,
  }, () => {
    throw new Error(`pending-join ${join.id} must not run`);
  });
}
