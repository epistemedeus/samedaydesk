import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  ERROR_CODES,
  PACKET_STATUS,
  SCHEMA,
  assembleDisputePacket,
  exchange01,
} from "../src/index.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const f01 = join(root, "../01/fixtures");
const load = (dir, name) => JSON.parse(readFileSync(join(dir, name), "utf8"));

test("assembles neutral packet with disagreements and no adjudication", () => {
  const brief = exchange01.buildAcceptanceBrief(load(f01, "requirements.positive.json"));
  const packet = assembleDisputePacket({
    brief,
    proposal: load(root, "fixtures/proposal.json"),
    artifact: load(f01, "artifact.partial.json"),
    requesterStatement: "fix digest",
    workerStatement: "digest optional",
    sources: [{ id: "s1", label: "fixture", uri: "file:01/fixtures" }],
  });
  assert.equal(packet.schema, SCHEMA);
  assert.equal(packet.status, PACKET_STATUS.ASSEMBLED);
  assert.equal(packet.adjudicationPolicy.automaticDecision, false);
  assert.equal(packet.adjudicationPolicy.declaresWinner, false);
  assert.ok(!("winner" in packet));
  assert.ok(!("adjudication" in packet));
  assert.ok(packet.taskVersions.briefRevisionSha256);
  assert.ok(packet.promisedCriteria.length >= 5);
  assert.ok(packet.disagreements.some((d) => d.kind === "objective_failed" || d.kind === "conflicting_party_statements"));
});

test("incomplete when only brief provided", () => {
  const brief = exchange01.buildAcceptanceBrief(load(f01, "requirements.positive.json"));
  const packet = assembleDisputePacket({ brief });
  assert.equal(packet.status, PACKET_STATUS.INCOMPLETE);
  assert.ok(packet.missingInputs.includes("proposal"));
});

test("positive artifact yields no objective_failed disagreements", () => {
  const brief = exchange01.buildAcceptanceBrief(load(f01, "requirements.positive.json"));
  const packet = assembleDisputePacket({
    brief,
    proposal: load(root, "fixtures/proposal.json"),
    artifact: load(f01, "artifact.positive.json"),
    requesterStatement: "ok",
    workerStatement: "ok",
  });
  assert.equal(packet.status, PACKET_STATUS.ASSEMBLED);
  assert.ok(!packet.disagreements.some((d) => d.kind === "objective_failed"));
});

test("rejects winner/adjudication fields", () => {
  const brief = exchange01.buildAcceptanceBrief(load(f01, "requirements.positive.json"));
  assert.throws(
    () => assembleDisputePacket({ brief, winner: "requester" }),
    (err) => err.code === ERROR_CODES.FORBIDDEN_CLAIM,
  );
});
