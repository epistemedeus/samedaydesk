import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { PACKET_SCHEMA } from "../src/constants.mjs";

const pack = dirname(fileURLToPath(new URL(".", import.meta.url)));

function load(rel) {
  return JSON.parse(readFileSync(join(pack, rel), "utf8"));
}

test("committed --example packet is a real 1.4.7 envelope (no corrections[], no sourceObservation)", () => {
  const packet = load("fixtures/cold/example.packet.json");
  assert.equal(packet.schema, PACKET_SCHEMA);
  assert.equal(packet.appId, "listing-repair-packet");
  assert.equal(packet.status, "actionable");
  assert.equal(packet.caller.exampleMode, true);
  assert.equal(packet.caller.sampleLabel, "explicit-example");
  assert.equal(packet.sourceLinked, true);
  assert.equal(Array.isArray(packet.actions), true);
  assert.ok(packet.actions.length >= 1);
  assert.equal(
    packet.actions.every((a) => a.kind === "owner-repair"),
    true,
  );
  assert.ok(packet.actions.some((a) => Array.isArray(a.sourceRefs) && a.sourceRefs[0]?.startsWith("route:")));
  assert.equal(Object.hasOwn(packet, "corrections"), false);
  assert.equal(Object.hasOwn(packet, "sourceObservation"), false);
  assert.equal(Object.hasOwn(packet, "asOf"), false);
  assert.equal(typeof packet.digest, "string");
});

test("committed mismatch packet is refused 1.4.7 output, not accepted_correction material", () => {
  const packet = load("fixtures/cold/mismatch.packet.json");
  assert.equal(packet.schema, PACKET_SCHEMA);
  assert.equal(packet.status, "refused");
  assert.equal(packet.underlying.status, "mismatch");
  assert.equal(packet.caller.exampleMode, false);
  assert.equal(packet.actions[0].kind, "fix-identity-or-source-join");
  assert.equal(Object.hasOwn(packet, "corrections"), false);
});
