import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { FORBIDDEN_COMPLETION_LABEL, REASON } from "../src/constants.mjs";

const pack = dirname(fileURLToPath(new URL(".", import.meta.url)));
const bin = join(pack, "bin/listing-repair-verifier.mjs");

function verdict(args) {
  const r = spawnSync(process.execPath, [bin, ...args], {
    encoding: "utf8",
    cwd: pack,
  });
  let body;
  try {
    body = JSON.parse(String(r.stdout || "").trim());
  } catch (e) {
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
  assert.notEqual(body.provenance.completionLabel, FORBIDDEN_COMPLETION_LABEL);
}

test("stale observedAt older than packet asOf is rejected", () => {
  const { status, body } = verdict([
    "verify",
    "--packet",
    "fixtures/reject/stale-observed-at.packet.json",
    "--source",
    "fixtures/reject/stale-observed-at.source.json",
  ]);
  assert.equal(status, 1);
  assertRejected(body, REASON.STALE_OBSERVED_AT);
  assert.equal(body.checks.stale, true);
});

test("fabricated SAMPLE labelled accepted_correction is rejected", () => {
  const { status, body } = verdict([
    "verify",
    "--packet",
    "fixtures/reject/fabricated-sample.packet.json",
    "--source",
    "fixtures/ok/ok-source.json",
  ]);
  assert.equal(status, 1);
  assertRejected(body, REASON.FABRICATED_SAMPLE);
  assert.equal(body.checks.fabricated, true);
});

test("publish-attempt is rejected", () => {
  const { status, body } = verdict([
    "verify",
    "--packet",
    "fixtures/reject/publish-attempt.packet.json",
    "--source",
    "fixtures/ok/ok-source.json",
  ]);
  assert.equal(status, 1);
  assertRejected(body, REASON.PUBLISH_ATTEMPTED);
  assert.ok(
    body.reasons.includes(REASON.LIVE_SDS_WRITE) || body.reasons.includes(REASON.PUBLISH_ATTEMPTED),
  );
});

test("invented field is rejected", () => {
  const { status, body } = verdict([
    "verify",
    "--packet",
    "fixtures/reject/invented-field.packet.json",
    "--source",
    "fixtures/ok/ok-source.json",
  ]);
  assert.equal(status, 1);
  assertRejected(body, REASON.INVENTED_FIELD);
});

test("no-op false correction is rejected", () => {
  const { status, body } = verdict([
    "verify",
    "--packet",
    "fixtures/reject/noop.packet.json",
    "--source",
    "fixtures/reject/already-correct.source.json",
  ]);
  assert.equal(status, 1);
  assertRejected(body, REASON.FALSE_CORRECTION);
});

test("missing source observation is rejected", () => {
  const { status, body } = verdict([
    "verify",
    "--packet",
    "fixtures/reject/missing-source.packet.json",
  ]);
  assert.equal(status, 1);
  assertRejected(body, REASON.MISSING_SOURCE_OBSERVATION);
});

test("CLI --publish is rejected", () => {
  const { status, body } = verdict([
    "verify",
    "--packet",
    "fixtures/ok/ok.packet.json",
    "--source",
    "fixtures/ok/ok-source.json",
    "--publish",
  ]);
  assert.equal(status, 1);
  assertRejected(body, REASON.PUBLISH_ATTEMPTED);
});

test("legacy corrections[] without actions[] is rejected", () => {
  const { status, body } = verdict([
    "verify",
    "--packet",
    "fixtures/reject/legacy-corrections-only.packet.json",
    "--source",
    "fixtures/ok/ok-source.json",
  ]);
  assert.equal(status, 1);
  assertRejected(body, REASON.LEGACY_CORRECTIONS_SHAPE);
});

test("http(s) --source is live SDS write, not a fetch", () => {
  const { status, body } = verdict([
    "verify",
    "--packet",
    "fixtures/ok/ok.packet.json",
    "--source",
    "https://samedaydesk.com/for-agents/useful-jobs",
  ]);
  assert.equal(status, 1);
  assertRejected(body, REASON.LIVE_SDS_WRITE);
});
