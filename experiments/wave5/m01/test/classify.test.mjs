import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { invokeEngine } from "../lib/invoke.mjs";
import { tmpOut } from "./helpers.mjs";

test("missing engine bin is transport-failure, not a domain refusal", () => {
  const empty = tmpOut("empty-engine");
  mkdirSync(join(empty, "bin"), { recursive: true });
  const result = invokeEngine({
    engineId: "lockfile-pin-delta",
    engineRoot: empty,
    outDir: tmpOut("crash"),
    inputs: { before: "/tmp/nope-before.json", after: "/tmp/nope-after.json" },
  });
  assert.equal(result.outcome.kind, "transport-failure");
  assert.equal(result.outcome.code, "missing-engine-bin");
  assert.equal(result.ok, false);
});
