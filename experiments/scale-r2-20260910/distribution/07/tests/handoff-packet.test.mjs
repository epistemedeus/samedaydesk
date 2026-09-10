import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  ERROR_CODES,
  GREXAL_S149,
  PACKET_SCHEMA,
  PACKET_STATUS,
  assertCaptureDistinct,
  assertKillHasNoCommands,
  buildHandoffPacket,
  detectKill,
  validatePacket,
  validateRequest,
} from "../src/index.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const load = (name) => JSON.parse(readFileSync(join(root, "fixtures", name), "utf8"));
const clock = () => Date.parse("2026-09-10T20:00:00.000Z");

test("positive: unresolved verified request → ready_handoff with Grexal S149 artifact", () => {
  const packet = buildHandoffPacket(load("request.positive.json"), { clock });
  assert.equal(packet.schema, PACKET_SCHEMA);
  assert.equal(packet.status, PACKET_STATUS.READY_HANDOFF);
  assert.equal(packet.generatedAt, "2026-09-10T20:00:00.000Z");
  assert.equal(packet.requestId, "req-s149-source-change-001");
  assert.equal(packet.unresolved, true);
  assert.equal(packet.requesterAlreadyHasFix, false);
  assert.equal(packet.artifactRef.type, "source_change_evidence_pack");
  assert.match(packet.artifactRef.packagePath, /grexal\/package/);
  assert.match(packet.artifactRef.receiptRef, /receipts-grexal-s149\.json/);
  assert.equal(packet.artifactRef.listingStatus, "PUBLIC_ACTIVE");
  assert.equal(packet.artifactRef.agentId, GREXAL_S149.agentId);
  assert.equal(packet.artifactRef.pricingRunCompletedUsd, 0.02);
  assert.equal(packet.artifactRef.estimateReserveIsCharge, false);
  assert.equal(packet.artifactRef.customerExecutionRevenuePayout, false);
  assert.ok(Array.isArray(packet.runCommands) && packet.runCommands.length >= 1);
  assert.ok(Array.isArray(packet.acceptanceChecks) && packet.acceptanceChecks.length >= 1);
  assert.equal(packet.privacyBounds.noInventedRevenue, true);
  assert.equal(packet.privacyBounds.listPriceIsNotRevenue, true);
  assert.equal(packet.mutationBoundary.executesProviderMutations, false);
  assert.equal(packet.mutationBoundary.killWhenRequesterHasFix, true);
  validatePacket(packet);
});

test("kill: requesterAlreadyHasFix=true → killed_requester_has_fix, empty runCommands", () => {
  const packet = buildHandoffPacket(load("request.kill-has-fix.json"), { clock });
  assert.equal(packet.status, PACKET_STATUS.KILLED_REQUESTER_HAS_FIX);
  assert.equal(packet.code, ERROR_CODES.KILLED_REQUESTER_HAS_FIX);
  assert.equal(packet.requesterAlreadyHasFix, true);
  assert.ok(packet.killReason.includes("fix") || packet.killReason.includes("Kill"));
  assert.ok(packet.killSignals.includes("requesterAlreadyHasFix=true"));
  assert.equal(packet.runCommands.length, 0);
  assert.equal(packet.artifactRef, null);
  assert.equal(assertKillHasNoCommands(packet), true);
  validatePacket(packet);
});

test("kill: unresolved=false with fixEvidence → killed_requester_has_fix", () => {
  const packet = buildHandoffPacket(load("request.kill-resolved.json"), { clock });
  assert.equal(packet.status, PACKET_STATUS.KILLED_REQUESTER_HAS_FIX);
  assert.equal(packet.runCommands.length, 0);
  assert.ok(packet.killSignals.some((s) => s.includes("unresolved=false")));
  assert.equal(assertKillHasNoCommands(packet), true);
  validatePacket(packet);
});

test("detectKill helper returns null for unresolved without fix", () => {
  const doc = load("request.positive.json");
  assert.equal(detectKill(doc), null);
});

test("detectKill helper fires on requesterAlreadyHasFix", () => {
  const kill = detectKill(load("request.kill-has-fix.json"));
  assert.ok(kill);
  assert.ok(kill.signals.includes("requesterAlreadyHasFix=true"));
});

test("negative: invented revenue / broadcast fields rejected", () => {
  assert.throws(
    () => validateRequest(load("request.malformed.json")),
    (err) =>
      err.code === ERROR_CODES.FORBIDDEN_BROADCAST ||
      err.code === ERROR_CODES.FORBIDDEN_CLAIM,
  );
  assert.throws(
    () => buildHandoffPacket(load("request.malformed.json"), { clock }),
    (err) =>
      err.code === ERROR_CODES.FORBIDDEN_BROADCAST ||
      err.code === ERROR_CODES.FORBIDDEN_CLAIM,
  );
});

test("partial: missing requestId/requesterId/problemSummary → blocked_missing_input", () => {
  const packet = buildHandoffPacket(load("request.partial.json"), { clock });
  assert.equal(packet.status, PACKET_STATUS.BLOCKED_MISSING_INPUT);
  assert.equal(packet.code, ERROR_CODES.BLOCKED_MISSING_INPUT);
  assert.ok(packet.missingInputs.some((m) => m.includes("requestId")));
  assert.ok(packet.missingInputs.some((m) => m.includes("requesterId")));
  assert.ok(packet.missingInputs.some((m) => m.includes("problemSummary")));
  assert.equal(packet.runCommands.length, 0);
  validatePacket(packet);
});

test("unavailable: capture failed omits requesterCount and runCommands", () => {
  const packet = buildHandoffPacket(load("request.unavailable.json"), { clock });
  assert.equal(packet.status, PACKET_STATUS.UNAVAILABLE);
  assert.equal(packet.code, ERROR_CODES.UNAVAILABLE);
  assert.equal(
    Object.prototype.hasOwnProperty.call(packet, "requesterCount"),
    false,
  );
  assert.equal(packet.runCommands.length, 0);
  validatePacket(packet);
});

test("no_users: capture ok with zero verified requesters", () => {
  const packet = buildHandoffPacket(load("request.no-users.json"), { clock });
  assert.equal(packet.status, PACKET_STATUS.NO_USERS);
  assert.equal(packet.code, ERROR_CODES.NO_USERS);
  assert.equal(packet.requesterCount, 0);
  assert.equal(packet.runCommands.length, 0);
  validatePacket(packet);
});

test("unavailable ≠ no_users", () => {
  const unavailable = buildHandoffPacket(load("request.unavailable.json"), { clock });
  const noUsers = buildHandoffPacket(load("request.no-users.json"), { clock });
  assert.equal(assertCaptureDistinct(unavailable, noUsers), true);
  assert.notEqual(unavailable.status, noUsers.status);
  assert.notEqual(unavailable.code, noUsers.code);
  assert.equal(
    Object.prototype.hasOwnProperty.call(unavailable, "requesterCount"),
    false,
  );
  assert.equal(noUsers.requesterCount, 0);
});

test("validatePacket rejects ready_handoff claiming customer revenue", () => {
  const packet = buildHandoffPacket(load("request.positive.json"), { clock });
  const poisoned = {
    ...packet,
    artifactRef: { ...packet.artifactRef, customerExecutionRevenuePayout: true },
  };
  assert.throws(
    () => validatePacket(poisoned),
    (err) => err.code === ERROR_CODES.FORBIDDEN_CLAIM,
  );
});

test("validatePacket rejects kill packet that smuggles runCommands", () => {
  const killed = buildHandoffPacket(load("request.kill-has-fix.json"), { clock });
  const poisoned = {
    ...killed,
    runCommands: [{ command: "npm test", cwd: "/tmp", note: "smuggle" }],
  };
  assert.throws(
    () => validatePacket(poisoned),
    (err) => err.code === ERROR_CODES.INVALID_INPUT,
  );
});

test("validatePacket rejects collapsed unavailable-as-no_users label", () => {
  const unavailable = buildHandoffPacket(load("request.unavailable.json"), { clock });
  const collapsed = {
    ...unavailable,
    labels: { collapsedUnavailableAsNoUsers: true },
  };
  assert.throws(
    () => validatePacket(collapsed),
    (err) => err.code === ERROR_CODES.INVALID_INPUT,
  );
});

test("validatePacket rejects unavailable packet that includes requesterCount", () => {
  const unavailable = buildHandoffPacket(load("request.unavailable.json"), { clock });
  const poisoned = { ...unavailable, requesterCount: 0 };
  assert.throws(
    () => validatePacket(poisoned),
    (err) => err.code === ERROR_CODES.INVALID_INPUT,
  );
});

test("ready handoff runCommands cwd points at Grexal package path", () => {
  const packet = buildHandoffPacket(load("request.positive.json"), { clock });
  assert.ok(
    packet.runCommands.every((c) =>
      String(c.cwd).includes("grexal/package"),
    ),
  );
  assert.ok(
    packet.runCommands.some((c) => c.command.includes("pack_evidence")),
  );
});
