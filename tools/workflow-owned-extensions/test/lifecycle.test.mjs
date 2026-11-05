import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { registerExtension, updateExtension, removeExtension, readExtension } from "../src/lifecycle.mjs";
import { assertHonestStatuses } from "../src/status.mjs";
import { INSTALLATION_STATUS, RUNTIME_EXECUTION_STATUS } from "../src/pins.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, "../fixtures/lifecycle");

function load(name) {
  return JSON.parse(readFileSync(join(fixtures, name), "utf8"));
}

test("register, update, and remove retain honest status and match fixtures", () => {
  const store = mkdtempSync(join(tmpdir(), "woe-life-"));
  const registered = registerExtension({ store, consumer: "dify", clock: "2026-11-05T12:00:00.000Z" });
  assert.deepEqual(registered, load("registered.json"));
  const updated = updateExtension({ store, consumer: "dify", version: "0.1.1", clock: "2026-11-05T12:05:00.000Z" });
  assert.deepEqual(updated, load("updated.json"));
  assert.equal(updated.record.createdAt, "2026-11-05T12:00:00.000Z");
  assert.equal(updated.record.previousVersions[0].version, "0.1.0");
  const removed = removeExtension({ store, consumer: "dify", clock: "2026-11-05T12:10:00.000Z" });
  assert.deepEqual(removed, load("removed.json"));
  assert.equal(removed.record.removed, true);
  const status = readExtension({ store, consumer: "dify" });
  assert.equal(status.record.removed, true);
  assert.equal(status.record.installationStatus, INSTALLATION_STATUS);
  assert.equal(status.record.runtimeExecutionStatus, RUNTIME_EXECUTION_STATUS);
});

test("registering the Ghost consumer is separate and remains source-only", () => {
  const store = mkdtempSync(join(tmpdir(), "woe-ghost-"));
  const registered = registerExtension({ store, consumer: "ghost", clock: "2026-11-05T12:00:00.000Z" });
  assert.deepEqual(registered, load("ghost-registered.json"));
  assert.equal(registered.record.id, "ghost-result-reuse");
  assert.equal(registered.record.runtime, "ghost");
  assert.equal(registered.record.consumerKind, "consumer_adapter");
});

test("update refuses to invent an install-passed status", () => {
  assert.deepEqual(assertHonestStatuses({ installationStatus: "passed" }), {
    ok: false,
    message: "manifests must not claim installation passed",
  });
  assert.deepEqual(assertHonestStatuses({ runtimeExecutionStatus: "executed" }), {
    ok: false,
    message: "runtime execution status must stay explicit and unexecuted",
  });
});

test("an active record must be updated rather than silently replaced", () => {
  const store = mkdtempSync(join(tmpdir(), "woe-dup-"));
  registerExtension({ store, consumer: "dify", clock: "2026-11-05T12:00:00.000Z" });
  const again = registerExtension({ store, consumer: "dify", version: "0.2.0", clock: "2026-11-05T12:01:00.000Z" });
  assert.equal(again.ok, false);
  assert.match(again.message, /use update/);
});
