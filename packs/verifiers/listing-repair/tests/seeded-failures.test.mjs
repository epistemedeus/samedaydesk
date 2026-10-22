import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { FORBIDDEN_COMPLETION_LABEL, REASON } from "../src/constants.mjs";

const pack = dirname(fileURLToPath(new URL(".", import.meta.url)));
const bin = join(pack, "bin/listing-repair-verifier.mjs");

function verdict(args) {
  const r = spawnSync(process.execPath, [bin, ...args], { encoding: "utf8", cwd: pack });
  let body;
  try {
    body = JSON.parse(String(r.stdout || "").trim());
  } catch {
    throw new Error(`bad JSON status=${r.status} stdout=${r.stdout} stderr=${r.stderr}`);
  }
  return { status: r.status, body };
}

function assertRejected(body, code) {
  assert.equal(body.ok, false);
  assert.ok(body.reasons.includes(code), `expected ${code} in ${JSON.stringify(body.reasons)}`);
  assert.equal(body.checks.publish, false);
  assert.equal(body.checks.accepted_correction, false);
  assert.equal(body.provenance.purchaseAuthority, false);
  assert.equal(Object.hasOwn(body, FORBIDDEN_COMPLETION_LABEL), false);
}

test("1.4.7 --example packet is fabricated_sample and not accepted_correction", () => {
  const { status, body } = verdict([
    "verify",
    "--packet",
    "fixtures/cold/example.packet.json",
    "--source",
    "fixtures/cold/example.source.json",
    "--bind",
    "fixtures/cold/example.bind.json",
  ]);
  assert.equal(status, 1);
  assertRejected(body, REASON.FABRICATED_SAMPLE);
  assert.equal(body.checks.fabricated, true);
  assert.equal(body.checks.envelopeBound, true);
  assert.equal(body.checks.sourceBound, true);
});

test("mismatch.json packet cannot be accepted_correction", () => {
  const { status, body } = verdict([
    "verify",
    "--packet",
    "fixtures/cold/mismatch.packet.json",
    "--source",
    "fixtures/cold/mismatch.source.json",
  ]);
  assert.equal(status, 1);
  assertRejected(body, REASON.MISMATCH_NOT_CORRECTION);
  assert.equal(body.checks.mismatch, true);
  assert.equal(body.checks.envelopeBound, true);
});

test("mismatch packet claiming accepted_correction is refused", () => {
  const { status, body } = verdict([
    "verify",
    "--packet",
    "fixtures/reject/mismatch-claimed-accepted-correction.packet.json",
    "--source",
    "fixtures/cold/mismatch.source.json",
  ]);
  assert.equal(status, 1);
  assertRejected(body, REASON.CORRECTION_FROM_MISMATCH);
  assert.ok(body.reasons.includes(REASON.MISMATCH_NOT_CORRECTION));
});

test("mutated snapshot digest is stale_source_digest", () => {
  const { status, body } = verdict([
    "verify",
    "--packet",
    "fixtures/cold/mismatch.packet.json",
    "--source",
    "fixtures/cold/mutated.source.json",
  ]);
  assert.equal(status, 1);
  assertRejected(body, REASON.STALE_SOURCE_DIGEST);
  assert.equal(body.checks.stale, true);
});

test("legacy corrections[] without 1.4.7 actions is rejected", () => {
  const { status, body } = verdict([
    "verify",
    "--packet",
    "fixtures/reject/legacy-corrections.packet.json",
    "--source",
    "fixtures/cold/example.source.json",
  ]);
  assert.equal(status, 1);
  assertRejected(body, REASON.LEGACY_CORRECTIONS_SHAPE);
});

test("publish-attempt on a 1.4.7 packet is rejected", () => {
  const { status, body } = verdict([
    "verify",
    "--packet",
    "fixtures/reject/publish-attempt.packet.json",
    "--source",
    "fixtures/cold/example.source.json",
  ]);
  assert.equal(status, 1);
  assertRejected(body, REASON.PUBLISH_ATTEMPTED);
});

test("CLI --publish is rejected", () => {
  const { status, body } = verdict([
    "verify",
    "--packet",
    "fixtures/cold/example.packet.json",
    "--source",
    "fixtures/cold/example.source.json",
    "--publish",
  ]);
  assert.equal(status, 1);
  assertRejected(body, REASON.PUBLISH_ATTEMPTED);
});

test("https --source is live SDS write, not a fetch", () => {
  const { status, body } = verdict([
    "verify",
    "--packet",
    "fixtures/cold/example.packet.json",
    "--source",
    "https://samedaydesk.com/for-agents/useful-jobs",
  ]);
  assert.equal(status, 1);
  assertRejected(body, REASON.LIVE_SDS_WRITE);
});

test("non-SDS https --source is also live_sds_write, not a fetch", () => {
  const { status, body } = verdict([
    "verify",
    "--packet",
    "fixtures/cold/example.packet.json",
    "--source",
    "https://example.com/listing.json",
  ]);
  assert.equal(status, 1);
  assertRejected(body, REASON.LIVE_SDS_WRITE);
});

test("missing --source is missing_source_observation", () => {
  const { status, body } = verdict(["verify", "--packet", "fixtures/cold/example.packet.json"]);
  assert.equal(status, 1);
  assertRejected(body, REASON.MISSING_SOURCE_OBSERVATION);
});

test("diagnosed --input caller-alpha packet vs mismatch.json is not accepted_correction", () => {
  const { status, body } = verdict([
    "verify",
    "--packet",
    "fixtures/cold/input-alpha.packet.json",
    "--source",
    "fixtures/cold/mismatch.source.json",
  ]);
  assert.equal(status, 1);
  assertRejected(body, REASON.SOURCE_LOCATOR_MISMATCH);
  assert.equal(body.checks.sourceBound, false);
});

test("partial capture packet is not accepted_correction", () => {
  const { status, body } = verdict([
    "verify",
    "--packet",
    "fixtures/cold/partial.packet.json",
    "--source",
    "fixtures/cold/partial.source.json",
  ]);
  assert.equal(status, 1);
  assertRejected(body, REASON.PARTIAL_NOT_FINAL);
});

test("bind sidecar packetDigest mismatch is packet_digest_mismatch", () => {
  const { status, body } = verdict([
    "verify",
    "--packet",
    "fixtures/cold/input-alpha.packet.json",
    "--source",
    "fixtures/cold/example.source.json",
    "--bind",
    "fixtures/cold/example.bind.json",
  ]);
  assert.equal(status, 1);
  assertRejected(body, REASON.PACKET_DIGEST_MISMATCH);
});
