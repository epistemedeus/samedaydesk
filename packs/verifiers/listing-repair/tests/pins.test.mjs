import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { OWNER_ACTION_KINDS, PINS } from "../src/constants.mjs";
import { findKitArchive, pinKitArchive, repoRootFromPack } from "../src/kit.mjs";
import { collectOwnerActions } from "../src/verify.mjs";

const pack = dirname(fileURLToPath(new URL(".", import.meta.url)));

test("pins bind useful-jobs 1.4.7 archive sha and overlay hashes", () => {
  assert.equal(PINS.usefulJobs, "1.4.7");
  assert.equal(PINS.archiveSha256, "e2e9b44e4d7318ac55052953318f05e53dbc121ab02e2762e34c919ac5469dec");
  assert.equal(PINS.archiveBytes, 5255824);
  assert.equal(PINS.cliSha256, "4ccda94e10e857109377a99b52050b07ad177bb05e85ff24f0ed1d8b158ece56");
  assert.equal(PINS.boundarySha256, "12010bf92ef4e2836f824ffa5d3291ee2fa0e61d6a526378c71472a23b6b275e");
  assert.equal(PINS.purchaseAuthority, false);
  assert.equal(PINS.republishKit, false);
});

test("repo 1.4.7 archive bytes match the pin (kit not republished)", () => {
  const archive = findKitArchive(repoRootFromPack(pack));
  assert.ok(archive, "expected 1.4.7 archive in repo");
  const pin = pinKitArchive(archive, { repoRoot: repoRootFromPack(pack) });
  assert.equal(pin.ok, true, JSON.stringify(pin));
  assert.equal(pin.sha256, PINS.archiveSha256);
  assert.equal(pin.bytes, PINS.archiveBytes);
  assert.equal(pin.path, PINS.forAgentsPath);
  assert.equal(isAbsolute(pin.path), false);
});

test("committed pins.json does not embed a host absolute path", () => {
  const pins = JSON.parse(readFileSync(join(pack, "fixtures/pins.json"), "utf8"));
  assert.equal(pins.archivePin.path, PINS.forAgentsPath);
  assert.equal(isAbsolute(pins.archivePin.path), false);
});

test("collectOwnerActions ignores corrections[]-only packets", () => {
  const actions = collectOwnerActions({
    corrections: [{ field: "listingStatus", from: "a", to: "b" }],
    actions: [],
  });
  assert.equal(actions.length, 0);
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
