import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { OWNER_ACTION_KINDS, PINS } from "../src/constants.mjs";
import { claimsGlobalUnlist, collectOwnerActions, collectFieldCorrections, locatorsMatch } from "../src/verify.mjs";

const pack = dirname(fileURLToPath(new URL(".", import.meta.url)));

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

test("locatorsMatch does not treat basename-only paths as the same listing", () => {
  assert.equal(
    locatorsMatch({ file: "fixtures/ok/ok-source.json" }, { file: "fixtures/reject/decoy/ok-source.json" }),
    false,
  );
  assert.equal(
    locatorsMatch({ file: "fixtures/ok/ok-source.json" }, { file: "fixtures/ok/ok-source.json" }),
    true,
  );
});

test("global unlist detector ignores gap honesty notes", () => {
  assert.equal(
    claimsGlobalUnlist({
      summary: "Listing repair packet status=partial",
      actions: [{ note: "complete-capture" }],
      gaps: ["Incomplete current capture cannot prove disappearance or global unlisting."],
    }),
    false,
  );
  assert.equal(
    claimsGlobalUnlist({
      summary: "Global unlisting achieved",
      actions: [{ note: "owner-repair" }],
    }),
    true,
  );
});

test("stamp-fixtures writes the packet names the CLI tests invoke", () => {
  const src = readFileSync(join(pack, "src/stamp-fixtures.mjs"), "utf8");
  assert.ok(src.includes("fixtures/ok/ok.packet.json"));
  assert.ok(src.includes("fixtures/ok/ok-route.packet.json"));
  assert.equal(src.includes("fixtures/ok/ok-packet.json"), false);
  assert.equal(src.includes("fixtures/ok/ok-route-packet.json"), false);
});
