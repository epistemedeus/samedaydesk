import assert from "node:assert/strict";
import { test } from "node:test";
import { runFirstUse } from "../first-run.mjs";

test("first-run: question → verified artifact → corrected answer", () => {
  const out = runFirstUse();
  assert.equal(out.packageId, "R2-TOWNSQUARE-FIRST-RUN-S172");
  assert.equal(out.fabricatedUsers, false);
  assert.equal(out.paidInvoke, false);
  assert.equal(out.execute, false);
  assert.ok(out.question?.taskId);
  assert.ok(out.verifiedArtifact.capabilityIds.length >= 1);
  assert.equal(out.correctedAnswer.contradictionPreserved, true);
  assert.equal(out.kitTipOwned, "8760ee4dc4b65641dafa7067bd0e153cafdd71c8");
});
