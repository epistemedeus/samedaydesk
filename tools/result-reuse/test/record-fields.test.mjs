import test from "node:test";
import assert from "node:assert/strict";
import { exportReuse } from "../src/export.mjs";

test("selected explicit record fields retain useful recipe evidence through the existing scrubber", () => {
  const input = { status: "success", ok: true, networkUsed: false, invalidRecords: [], records: [{
    status: "success", fields: { outcome: "changed", title: "SDK migration",
      delta: { before: "v1", after: "v2" }, api_key: "sk-secret-shape-for-regression",
      hostile: "<script>alert(1)</script>" },
  }] };
  const frozen = JSON.stringify(input);
  const output = exportReuse(input, { optIn: true, taskId: "sdk-watch", subject: "sdk-result", sequence: 1, clock: "2026-10-02T00:00:00.000Z" });
  assert.equal(output.ok, true);
  assert.deepEqual(output.observation.payload.records[0].fields.delta, { before: "v1", after: "v2" });
  assert.equal(output.observation.payload.records[0].fields.title, "SDK migration");
  assert.equal(output.observation.payload.records[0].fields.api_key, undefined);
  assert.equal(output.observation.payload.records[0].fields.hostile, "[omitted]");
  assert.equal(output.publicSafeCertified, false);
  assert.equal(output.evidenceKind, "user_selected_unverified");
  assert.equal(JSON.stringify(input), frozen);
});

test("oversized selected record fields fail the existing payload bound", () => {
  const output = exportReuse({ status: "success", networkUsed: false, records: [{ fields: { title: "x".repeat(40_000) } }], invalidRecords: [] },
    { optIn: true, taskId: "sdk-watch", subject: "sdk-result", sequence: 1, clock: "2026-10-02T00:00:00.000Z" });
  assert.equal(output.ok, false);
  assert.match(output.message, /32768/);
});
