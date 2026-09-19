import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { callerInputMatchesSource } from "../src/bind.mjs";
import { PINS, REASON } from "../src/constants.mjs";
import { verifyListingRepair } from "../src/verify.mjs";

const pack = dirname(fileURLToPath(new URL(".", import.meta.url)));
const bin = join(pack, "bin/listing-repair-verifier.mjs");

function load(rel) {
  return JSON.parse(readFileSync(join(pack, rel), "utf8"));
}

test("caller.input basename pairs to source.file, not to a same-route sibling listing", () => {
  const packet = load("fixtures/cold/input-alpha.packet.json");
  const alpha = load("fixtures/cold/example.source.json");
  const mismatch = load("fixtures/cold/mismatch.source.json");
  assert.equal(callerInputMatchesSource(packet, alpha), true);
  assert.equal(callerInputMatchesSource(packet, mismatch), false);
  assert.equal(
    callerInputMatchesSource(packet, { identity: true, record: { routeRegressionInput: {} } }, { sourcePath: "samples/listing/caller-alpha.json" }),
    true,
  );
});

test("CLI --input caller-alpha packet against that listing is ok and accepted_correction", () => {
  const r = spawnSync(
    process.execPath,
    [
      bin,
      "verify",
      "--packet",
      "fixtures/cold/input-alpha.packet.json",
      "--source",
      "fixtures/cold/example.source.json",
      "--bind",
      "fixtures/cold/input-alpha.bind.json",
    ],
    { encoding: "utf8", cwd: pack },
  );
  const body = JSON.parse(String(r.stdout || "").trim());
  assert.equal(r.status, 0, JSON.stringify(body, null, 2));
  assert.equal(body.ok, true);
  assert.deepEqual(body.reasons, []);
  assert.equal(body.checks.accepted_correction, true);
  assert.equal(body.checks.publish, false);
  assert.equal(body.checks.fabricated, false);
  assert.equal(body.checks.mismatch, false);
  assert.equal(body.provenance.purchaseAuthority, false);
  assert.equal(body.packetDigest, "df7b5d4bea6e26a0");
});

test("library: alpha packet + mismatch snapshot (shared routes) is source_locator_mismatch", () => {
  const packet = load("fixtures/cold/input-alpha.packet.json");
  const mismatch = load("fixtures/cold/mismatch.source.json");
  const verdict = verifyListingRepair({
    packet,
    source: mismatch,
    flags: { sourcePath: "samples/listing/mismatch.json" },
  });
  assert.equal(verdict.ok, false);
  assert.ok(verdict.reasons.includes(REASON.SOURCE_LOCATOR_MISMATCH));
  assert.equal(verdict.checks.accepted_correction, false);
  assert.equal(verdict.checks.sourceBound, false);
});

test("library: raw listing without file or bind is unbound_packet_source", () => {
  const packet = load("fixtures/cold/input-alpha.packet.json");
  const listing = load("fixtures/cold/example.source.json").snapshot;
  const verdict = verifyListingRepair({ packet, source: listing });
  assert.equal(verdict.ok, false);
  assert.ok(verdict.reasons.includes(REASON.UNBOUND_PACKET_SOURCE));
  assert.equal(verdict.checks.accepted_correction, false);
});

test("uppercase kit sha256 on bind still matches the pin", () => {
  const packet = load("fixtures/cold/input-alpha.packet.json");
  const source = load("fixtures/cold/example.source.json");
  const bind = load("fixtures/cold/input-alpha.bind.json");
  bind.kit = { ...bind.kit, sha256: PINS.archiveSha256.toUpperCase() };
  const verdict = verifyListingRepair({ packet, source, bind });
  assert.equal(verdict.ok, true, JSON.stringify(verdict.reasons));
  assert.equal(verdict.reasons.includes(REASON.KIT_PIN_MISMATCH), false);
});

test("wrong kit sha256 on bind is kit_pin_mismatch", () => {
  const packet = load("fixtures/cold/input-alpha.packet.json");
  const source = load("fixtures/cold/example.source.json");
  const bind = load("fixtures/cold/input-alpha.bind.json");
  bind.kit = { ...bind.kit, sha256: "deadbeef".repeat(8) };
  const verdict = verifyListingRepair({ packet, source, bind });
  assert.equal(verdict.ok, false);
  assert.ok(verdict.reasons.includes(REASON.KIT_PIN_MISMATCH));
});

test("packet_digest_mismatch does not reuse stale_source_digest when only packet digest drifted", () => {
  const packet = load("fixtures/cold/input-alpha.packet.json");
  const source = load("fixtures/cold/example.source.json");
  const bind = load("fixtures/cold/input-alpha.bind.json");
  bind.packetDigest = "ffffffffffffffff";
  const verdict = verifyListingRepair({ packet, source, bind });
  assert.equal(verdict.ok, false);
  assert.ok(verdict.reasons.includes(REASON.PACKET_DIGEST_MISMATCH));
  assert.equal(verdict.reasons.includes(REASON.STALE_SOURCE_DIGEST), false);
  assert.equal(verdict.checks.stale, false);
});
