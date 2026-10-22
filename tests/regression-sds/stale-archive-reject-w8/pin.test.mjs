import assert from "node:assert/strict";
import test from "node:test";
import { EXPECTED_CURRENT, loadPins, PIN_CITES, readKitPin } from "./lib/pin.mjs";
import { NEGATIVE_CONTROL_VERSION, REPO_ROOT } from "./lib/root.mjs";

test("PIN_CITES cover kit, catalog, obtain-archive, and 1.1.0 negative control", () => {
  const ids = PIN_CITES.map((c) => c.id);
  for (const id of [
    "useful-jobs-kit-current",
    "useful-jobs-kit-negative-110",
    "catalog-current-version",
    "obtain-archive-wrong-digest",
    "public-110-not-current",
  ]) {
    assert.ok(ids.includes(id), id);
  }
});

test("cold loadPins hashes real kit and for-agents archive twins", () => {
  const pins = loadPins();
  assert.equal(pins.ok, true, JSON.stringify(pins.error, null, 2));
  assert.ok(pins.repoRoot === REPO_ROOT);
  assert.equal(pins.current.version, EXPECTED_CURRENT.version);
  assert.equal(pins.current.sha256, EXPECTED_CURRENT.sha256);
  assert.equal(pins.current.bytes, EXPECTED_CURRENT.bytes);
  assert.equal(pins.stale[NEGATIVE_CONTROL_VERSION].sha256, "de8ebee19ffd5d9019fa7988291fe37d861e7bf3f5ee7dd341c9d2f0f0065534");
  assert.notEqual(pins.stale[NEGATIVE_CONTROL_VERSION].sha256, pins.current.sha256);

  const byId = Object.fromEntries(pins.rows.map((row) => [row.id, row]));
  assert.equal(byId["archive-for-agents-current"].ok, true);
  assert.equal(byId["archive-kit-current"].sha256, EXPECTED_CURRENT.sha256);
  assert.equal(byId["archive-for-agents-1.1.0"].bytes, 2577606);
  assert.equal(byId["archive-kit-1.1.0"].sha256, byId["archive-for-agents-1.1.0"].sha256);
  assert.equal(byId["negative-control-110"].ok, true);
  assert.equal(byId["obtain-archive-present"].ok, true);
  assert.deepEqual(
    pins.rows.filter((row) => !row.ok),
    [],
  );
  assert.ok(pins.total >= 20);
});

test("readKitPin immutable list is not the current pin", () => {
  const kit = readKitPin();
  assert.equal(kit.version, "1.4.7");
  for (const row of kit.immutable) {
    assert.notEqual(row.sha256, kit.sha256, row.version);
    assert.notEqual(row.version, kit.version);
  }
});
