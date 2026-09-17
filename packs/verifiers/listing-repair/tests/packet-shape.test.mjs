import assert from "node:assert/strict";
import test from "node:test";
import { OWNER_ACTION_KINDS, PINS } from "../src/constants.mjs";
import { collectOwnerActions, collectFieldCorrections } from "../src/verify.mjs";

test("pins bind useful-jobs 1.4.7 archive sha", () => {
  assert.equal(PINS.usefulJobs, "1.4.7");
  assert.equal(PINS.archiveSha256, "e2e9b44e4d7318ac55052953318f05e53dbc121ab02e2762e34c919ac5469dec");
  assert.equal(PINS.archiveBytes, 5255824);
  assert.equal(PINS.purchaseAuthority, false);
});

test("collectOwnerActions ignores corrections[]-only packets", () => {
  const actions = collectOwnerActions({
    corrections: [{ field: "listingStatus", from: "a", to: "b" }],
    actions: [],
  });
  assert.equal(actions.length, 0);
});

test("collectFieldCorrections reads field rows from actions", () => {
  const rows = collectFieldCorrections({
    actions: [{ kind: "owner-repair", field: "listingStatus", from: "PendingReview", to: "PUBLIC_ACTIVE" }],
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].via, "action");
});

test("owner action kinds cover 1.4.7 cli.mjs emitters", () => {
  for (const k of [
    "owner-repair",
    "resolve-unknown",
    "review-diagnosis",
    "complete-capture",
    "fix-identity-or-source-join",
  ]) {
    assert.ok(OWNER_ACTION_KINDS.includes(k), k);
  }
});
