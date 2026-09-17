import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { envelope, exitFor, EXIT } from "./lib/envelope.mjs";

const here = dirname(fileURLToPath(import.meta.url));

test("schema.json is parseable draft-2020-12 for samedaydesk", () => {
  const schema = JSON.parse(readFileSync(join(here, "schema.json"), "utf8"));
  assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.equal(schema.properties.schemaVersion.const, 1);
  assert.equal(schema.properties.repo.const, "samedaydesk");
  for (const key of [
    "ok",
    "schemaVersion",
    "command",
    "repo",
    "checkedAt",
    "node",
    "dryRun",
    "status",
    "feature",
    "evidence",
    "error",
    "boundary",
  ]) {
    assert.ok(schema.required.includes(key), key);
  }
});

test("pass envelope has required keys and exit 0", () => {
  const env = envelope({ ok: true, command: "doctor" });
  assert.equal(env.ok, true);
  assert.equal(env.repo, "samedaydesk");
  assert.equal(env.schemaVersion, 1);
  assert.equal(env.boundary.paymentSent, false);
  assert.equal(env.boundary.toolsCalled, false);
  assert.equal(exitFor(env), EXIT.OK);
});

test("seed reject exits 1 not 0", () => {
  const env = envelope({
    ok: false,
    command: "archive",
    error: { code: "SEED_REJECT", message: "SHA mismatch remapped from child exit 0" },
  });
  assert.equal(exitFor(env), EXIT.FAIL);
});

test("usage exits 2", () => {
  const env = envelope({
    ok: false,
    command: "help",
    status: "usage",
    error: { code: "USAGE", message: "missing command" },
  });
  assert.equal(exitFor(env), EXIT.USAGE);
});

test("envelope pins paymentSent and toolsCalled false", () => {
  const env = envelope({
    ok: true,
    command: "doctor",
    boundary: { paymentSent: true, toolsCalled: true },
  });
  assert.equal(env.boundary.paymentSent, false);
  assert.equal(env.boundary.toolsCalled, false);
});
