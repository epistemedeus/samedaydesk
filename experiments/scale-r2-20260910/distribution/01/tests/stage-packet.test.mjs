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
  RECOMMENDED_PRICE,
  assertCaptureDistinct,
  buildRootActionPacket,
  validateInventory,
  validatePacket,
} from "../src/index.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const load = (name) => JSON.parse(readFileSync(join(root, "fixtures", name), "utf8"));
const clock = () => Date.parse("2026-09-10T11:45:00.000Z");

test("positive: ready_for_root packet with intentional small flat price recommendation", () => {
  const packet = buildRootActionPacket(load("inventory.positive.json"), { clock });
  assert.equal(packet.schema, PACKET_SCHEMA);
  assert.equal(packet.status, PACKET_STATUS.READY_FOR_ROOT);
  assert.equal(packet.generatedAt, "2026-09-10T11:45:00.000Z");
  assert.equal(packet.recommendations.price.unit, RECOMMENDED_PRICE.unit);
  assert.equal(packet.recommendations.price.amountUsd, 0.1);
  assert.equal(packet.recommendations.price.amountMicros, 100000);
  assert.equal(packet.recommendations.price.applied, false);
  assert.equal(packet.recommendations.publish.execute, false);
  assert.equal(packet.mutationBoundary.executesProviderMutations, false);
  assert.equal(packet.draftSummary.agentId, "agentId_REDACTED");
  assert.ok(packet.publicDiscoveryChecklist.length >= 4);
  assert.equal(packet.noChargeOwnerReadback.selfRunsFree, true);
  assert.equal(packet.audienceCapture.status, CAPTURE_STATUS.CAPTURED);
  validatePacket(packet);
});

test("negative: malformed inventory with invented revenue/buyers is rejected", () => {
  assert.throws(
    () => validateInventory(load("inventory.malformed.json")),
    (err) => err.code === ERROR_CODES.FORBIDDEN_CLAIM,
  );
  assert.throws(
    () => buildRootActionPacket(load("inventory.malformed.json"), { clock }),
    (err) => err.code === ERROR_CODES.FORBIDDEN_CLAIM,
  );
});

test("partial: missing price amount or deployment → blocked_missing_input", () => {
  const packet = buildRootActionPacket(load("inventory.partial.json"), { clock });
  assert.equal(packet.status, PACKET_STATUS.BLOCKED_MISSING_INPUT);
  assert.ok(packet.missingInputs.includes("draft.deployment.version"));
  assert.ok(packet.missingInputs.includes("evidence.preserveTip"));
  assert.ok(packet.missingInputs.includes("evidence.terminalPath"));
  assert.equal(packet.recommendations, null);
});

test("partial: wrong price recommendation amounts → blocked_missing_input", () => {
  const inv = load("inventory.positive.json");
  inv.priceRecommendation.amountUsd = 0.18;
  inv.priceRecommendation.amountMicros = 180000;
  const packet = buildRootActionPacket(inv, { clock });
  assert.equal(packet.status, PACKET_STATUS.BLOCKED_MISSING_INPUT);
  assert.ok(packet.missingInputs.some((m) => m.includes("priceRecommendation")));
});

test("unavailable: provider capture unavailable stays UNAVAILABLE without users=0", () => {
  const packet = buildRootActionPacket(load("inventory.unavailable.json"), { clock });
  assert.equal(packet.status, PACKET_STATUS.UNAVAILABLE);
  assert.equal(packet.audienceCapture.status, CAPTURE_STATUS.UNAVAILABLE);
  assert.equal(packet.audienceCapture.code, ERROR_CODES.UNAVAILABLE);
  assert.equal(packet.audienceCapture.label, "provider_capture_unavailable");
  assert.equal(
    Object.prototype.hasOwnProperty.call(packet.audienceCapture, "users"),
    false,
    "unavailable must not emit users field",
  );
  assert.equal(packet.recommendations, null);
});

test("no_users: capture succeeded with zero users is distinct status", () => {
  const packet = buildRootActionPacket(load("inventory.no-users.json"), { clock });
  assert.equal(packet.status, PACKET_STATUS.NO_USERS);
  assert.equal(packet.audienceCapture.status, CAPTURE_STATUS.NO_USERS);
  assert.equal(packet.audienceCapture.code, ERROR_CODES.NO_USERS);
  assert.equal(packet.audienceCapture.users, 0);
  assert.equal(packet.recommendations.price.amountUsd, 0.1);
  assert.equal(packet.recommendations.price.applied, false);
});

test("explicit: unavailable ≠ no_users (statuses, codes, labels)", () => {
  const unavailable = buildRootActionPacket(load("inventory.unavailable.json"), { clock });
  const noUsers = buildRootActionPacket(load("inventory.no-users.json"), { clock });
  assert.equal(assertCaptureDistinct(unavailable, noUsers), true);
  assert.notEqual(unavailable.status, noUsers.status);
  assert.notEqual(unavailable.audienceCapture.status, noUsers.audienceCapture.status);
  assert.notEqual(unavailable.audienceCapture.code, noUsers.audienceCapture.code);
  assert.notEqual(unavailable.audienceCapture.label, noUsers.audienceCapture.label);
});

test("rejects live-looking agentId in redistributable inventory", () => {
  const inv = load("inventory.positive.json");
  inv.draft.agentId = "j970cajvv6wbrmy64s2f4ajzw18e5j2q";
  assert.throws(
    () => validateInventory(inv),
    (err) => err.code === ERROR_CODES.FORBIDDEN_SECRET,
  );
});

test("validatePacket rejects collapsed unavailable+no_users pairing", () => {
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

test("DEMO live-pointers inventory stages ready_for_root without secrets", () => {
  const packet = buildRootActionPacket(load("inventory.live-pointers.DEMO.json"), { clock });
  assert.equal(packet.status, PACKET_STATUS.READY_FOR_ROOT);
  assert.equal(packet.draftSummary.agentId, "agentId_REDACTED");
  assert.ok(packet.evidencePointers.receiptRefs.length >= 5);
  assert.match(JSON.stringify(packet), /agentId_REDACTED/);
  assert.doesNotMatch(JSON.stringify(packet), /j970cajvv6wbrmy64s2f4ajzw18e5j2q/);
});
