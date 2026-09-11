import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { PINS } from "../lib/pins.mjs";
import { prefixLayout, pythonCli } from "../lib/install.mjs";
import { assertCleanPrefix } from "../lib/isolation.mjs";
import { sdsRepoRoot } from "../lib/locate.mjs";
import { sharedPrefix } from "./helpers.mjs";

test("clean prefix pip-installs Co14 and stages D01/D07 without SDS vendor trees", () => {
  const prefix = sharedPrefix();
  const layout = prefixLayout(prefix);
  const isolation = assertCleanPrefix(prefix);
  assert.equal(isolation.ok, true, JSON.stringify(isolation, null, 2));
  assert.equal(isolation.importedFromVenv, true);
  assert.equal(isolation.importedFromCheckout, false);
  assert.equal(isolation.accidents.length, 0);
  assert.ok(existsSync(pythonCli(prefix)));
  assert.ok(existsSync(join(layout.d01, "server/paid-useful-jobs/CONTRACT.md")));
  assert.ok(existsSync(join(layout.d07, "tools/job-artifact-export/lib/import.mjs")));
  assert.equal(existsSync(join(prefix, "vendor/neomorphic-correspondence")), false);
  assert.equal(existsSync(join(prefix, "package-lock.json")), false);
  assert.ok(!isolation.pythonModule.startsWith(join(sdsRepoRoot(), "tools/python-useful-jobs-client")));
  const install = JSON.parse(readFileSync(join(prefix, "INSTALL.json"), "utf8"));
  assert.equal(install.tested.d01.sha, PINS.tested.d01.sha);
  assert.equal(install.tested.d07.sha, PINS.tested.d07.sha);
  assert.equal(install.tested.d08.sha, PINS.tested.d08.sha);
});
