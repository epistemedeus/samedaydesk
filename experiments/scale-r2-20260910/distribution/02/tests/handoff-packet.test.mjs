import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  CAPTURE_STATUS,
  ERROR_CODES,
  PACKET_SCHEMA,
  PACKET_STATUS,
  PROVIDER_REVIEW,
  assertCaptureDistinct,
  buildRootHandoffPacket,
  validateInventory,
  validatePacket,
} from "../src/index.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const load = (name) => JSON.parse(readFileSync(join(root, "fixtures", name), "utf8"));
const clock = () => Date.parse("2026-09-10T12:00:00.000Z");

test("positive: PendingReview handoff packet with Free skill + exact demo pointer", () => {
  const packet = buildRootHandoffPacket(load("inventory.positive.json"), { clock });
  assert.equal(packet.schema, PACKET_SCHEMA);
  assert.equal(packet.status, PACKET_STATUS.PENDING_REVIEW_HANDOFF);
  assert.equal(packet.providerReview.status, PROVIDER_REVIEW.PENDING_REVIEW);
  assert.equal(packet.recommendations.resubmit, false);
  assert.equal(packet.recommendations.pricingType, "free");
  assert.match(packet.recommendations.exactDemoPointer, /DEMO\.md$/);
  assert.equal(packet.mutationBoundary.executesProviderMutations, false);
  validatePacket(packet);
});

test("negative: invented revenue/buyers rejected", () => {
  assert.throws(
    () => validateInventory(load("inventory.malformed.json")),
    (err) => err.code === ERROR_CODES.FORBIDDEN_CLAIM,
  );
});

test("negative: resubmit=true forbidden", () => {
  assert.throws(
    () => validateInventory(load("inventory.resubmit-forbidden.json")),
    (err) => err.code === ERROR_CODES.FORBIDDEN_CLAIM,
  );
});

test("partial: missing demo/zip → blocked_missing_input", () => {
  const packet = buildRootHandoffPacket(load("inventory.partial.json"), { clock });
  assert.equal(packet.status, PACKET_STATUS.BLOCKED_MISSING_INPUT);
  assert.ok(packet.missingInputs.includes("evidence.demoPath"));
  assert.ok(packet.missingInputs.includes("evidence.zipSha256"));
});

test("unavailable ≠ no_users", () => {
  const unavailable = buildRootHandoffPacket(load("inventory.unavailable.json"), { clock });
  const noUsers = buildRootHandoffPacket(load("inventory.no-users.json"), { clock });
  assert.equal(unavailable.status, PACKET_STATUS.UNAVAILABLE);
  assert.equal(unavailable.audienceCapture.status, CAPTURE_STATUS.UNAVAILABLE);
  assert.equal(
    Object.prototype.hasOwnProperty.call(unavailable.audienceCapture, "users"),
    false,
  );
  assert.equal(noUsers.status, PACKET_STATUS.NO_USERS);
  assert.equal(noUsers.audienceCapture.users, 0);
  assert.equal(assertCaptureDistinct(unavailable, noUsers), true);
});

test("validatePacket rejects collapsed unavailable+no_users", () => {
  assert.throws(
    () =>
      validatePacket({
        schema: PACKET_SCHEMA,
        status: "unavailable",
        audienceCapture: { status: "no_users", users: 0 },
      }),
    (err) => err.code === ERROR_CODES.INVALID_INPUT,
  );
});
