import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { PINS } from "../src/constants.mjs";

const pack = dirname(fileURLToPath(new URL(".", import.meta.url)));
const script = join(pack, "scripts/cold-bind.mjs");

test("cold 1.4.7 extract + engine run + oracle bind (real repair-packet.json)", () => {
  const r = spawnSync(process.execPath, [script], { encoding: "utf8", cwd: pack });
  let body;
  try {
    body = JSON.parse(String(r.stdout || "").trim());
  } catch {
    throw new Error(`cold-bind JSON parse failed status=${r.status} stdout=${r.stdout} stderr=${r.stderr}`);
  }
  assert.equal(r.status, 0, JSON.stringify(body.checks || body, null, 2));
  assert.equal(body.ok, true);
  assert.equal(body.kit.sha256, PINS.archiveSha256);
  assert.equal(body.kit.bytes, PINS.archiveBytes);
  assert.equal(body.republishKit, false);
  assert.equal(body.purchaseAuthority, false);

  assert.equal(body.example.engineExit, 0);
  assert.ok(body.example.reasons.includes("fabricated_sample"));
  assert.equal(body.example.accepted_correction, false);
  assert.equal(body.example.hasCorrections, false);
  assert.equal(body.example.hasSourceObservation, false);

  assert.equal(body.mismatch.packetStatus, "refused");
  assert.equal(body.mismatch.accepted_correction, false);
  assert.ok(body.mismatch.reasons.includes("mismatch_not_correction"));

  assert.ok(body.mutated.reasons.includes("stale_source_digest"));
  assert.ok(body.publish.reasons.includes("publish_attempted"));

  assert.equal(body.positive.ok, true);
  assert.equal(body.positive.verifyExit, 0);
  assert.equal(body.positive.accepted_correction, true);
  assert.equal(body.positive.exampleMode, false);
  assert.deepEqual(body.positive.reasons, []);

  assert.equal(body.cross.accepted_correction, false);
  assert.ok(body.cross.reasons.includes("source_locator_mismatch"));

  assert.equal(body.partial.packetStatus, "partial");
  assert.equal(body.partial.accepted_correction, false);
  assert.ok(body.partial.reasons.includes("partial_not_final"));
});
