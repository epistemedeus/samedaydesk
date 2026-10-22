import assert from "node:assert/strict";
import { test } from "node:test";

import { runJourney } from "../src/journey.mjs";

test("official client cancels its server-owned child; foreign/wrong/replay/race do not invent success", async () => {
  const out = await runJourney();
  assert.equal(out.ok, true, JSON.stringify(out.steps, null, 2));
  assert.equal(out.productionCardTouched, false);
  assert.equal(out.a2aCancelWiredToPayout, false);
  assert.equal(out.a2aCancelWiredToOwnerReject, false);
  assert.equal(out.quantitativeSavingsInvented, false);
  const by = Object.fromEntries(out.steps.map((s) => [s.step, s]));
  assert.ok(by.owner_cancel_confirmed.childExit.reason === "SIGTERM");
  assert.equal(by.wrong_id.childStillRunning, true);
  assert.equal(by.foreign_client.childStillRunning, true);
  assert.equal(by.local_uuid_not_interchangeable.equal, false);
  assert.equal(by.direct_read_baseline.getTaskPolls >= 1, true);
  assert.equal(by.sdk_default_unauthenticated_scope.foreignCouldCancel, true);
});
