import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PINS } from "../src/pins.mjs";

const sha = /^[0-9a-f]{40}$/;

test("every consumed pin is a full sha", () => {
  assert.equal(PINS.schema, "samedaydesk.ae20-e11-maintenance-shell.pins.v1");
  assert.equal(PINS.writerPath, "tools/ae20-e11-maintenance-shell");
  assert.equal(PINS.session, "7ea530ad-206a-4cb7-bb7b-990396b46be4");
  assert.match(PINS.base.startHead, sha);
  assert.equal(PINS.base.startHead, PINS.consumed.e11.commit);
  assert.match(PINS.consumed.e11.implementation, sha);
  assert.match(PINS.consumed.e11.receipt, sha);
  assert.equal(PINS.consumed.e21.commit, "2db38faab2f79cd7b3dc3110c54d301834c9611b");
  assert.equal(PINS.consumed.e21.branch, "codex/ae14-e21-contribution-handback");
  assert.match(PINS.consumed.e21.interfaceBlob, sha);
  assert.equal(PINS.consumed.e02ReadCurrent.commit, "89033e06ed6f2a455051ad8612c36394ad87a7a4");
  assert.equal(PINS.consumed.j2.commit, "016b38838d1fcc66128e000f39487d044dc497be");
  assert.equal(PINS.consumed.j2.branch, "codex/ae14-j2-work-network-composition");
  assert.match(PINS.consumed.j2.e11Status, /pending-join:E11@50210d0dbd2e24194c84b486bf31dc3c705ba06b/);
  assert.equal(PINS.consumed.amend4.commit, "d478ae8621d2f1ac90002e5a248286d784cc283c");
  assert.match(PINS.consumed.amend4.j2.blob, sha);
  assert.match(PINS.consumed.amend4.e21.blob, sha);
  assert.equal(PINS.consumed.portfolio.commit, "b8ead33382b7007df337e8adf7c1536e9fb2b5c3");
  assert.match(PINS.consumed.portfolio.blob, sha);
  assert.equal(PINS.canonicalGrant, "safe_derivative_only");
  assert.equal(PINS.requiredCoverage, "accepted_artifact");
  const file = JSON.parse(readFileSync(new URL("../PINS.json", import.meta.url), "utf8"));
  assert.deepEqual(file, PINS);
});
