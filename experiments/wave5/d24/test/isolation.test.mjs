import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { isolatedEnv, runPythonCli } from "../lib/invoke.mjs";
import { assertCleanPrefix, vendorOnlyCannotImport } from "../lib/isolation.mjs";
import { sharedPrefix } from "./helpers.mjs";

test("installed Python module is loaded from the prefix venv, not the SDS checkout", () => {
  const prefix = sharedPrefix();
  const isolation = assertCleanPrefix(prefix);
  assert.equal(isolation.ok, true);
  assert.match(isolation.pythonModule, /site-packages\/samedaydesk_useful_jobs/);
});

test("Co14 without --archive in a directory that is not SDS refuses missing-archive", () => {
  const prefix = sharedPrefix();
  const env = isolatedEnv(prefix);
  delete env.SAMEDAYDESK_ROOT;
  const result = runPythonCli(prefix, ["acquire"], { env });
  assert.notEqual(result.status, 0);
  assert.equal(result.json?.ok, false);
  assert.equal(result.json?.refused, true);
  assert.equal(result.json?.code, "missing-archive");
  assert.equal(result.json?.extracted, false);
  assert.equal(result.json?.executed, false);
});

test("vendor-only directory is not an installable client", () => {
  const prefix = sharedPrefix();
  const trap = vendorOnlyCannotImport(prefix);
  assert.equal(trap.hasPythonCli, false);
});

test("system python without the venv cannot import the client from a vendor trap", () => {
  const empty = join(tmpdir(), "w5-d24-vendor-trap");
  mkdirSync(empty, { recursive: true });
  writeFileSync(join(empty, "README.txt"), "not a package\n");
  const result = spawnSync("python3", ["-c", "import samedaydesk_useful_jobs"], {
    encoding: "utf8",
    env: {
      PATH: process.env.PATH,
      HOME: empty,
      PYTHONPATH: empty,
      PYTHONNOUSERSITE: "1",
      SAMEDAYDESK_ROOT: "",
    },
    cwd: empty,
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr || "", /ModuleNotFoundError|ModuleNotFound/);
});
