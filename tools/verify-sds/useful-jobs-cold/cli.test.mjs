import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { USEFUL_JOBS_PIN, WRONG_SHA, WRONG_BYTES } from "./lib/pin.mjs";
import { remapRefuse, parseJsonOutput } from "./lib/acquire.mjs";
import { isInsideRepo, defaultRoot } from "./lib/repo.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../../..");
const cli = join(here, "cli.mjs");

function runCli(args) {
  const ran = spawnSync(process.execPath, [cli, ...args], {
    encoding: "utf8",
    cwd: root,
    env: process.env,
    timeout: 120_000,
    maxBuffer: 8 * 1024 * 1024,
  });
  return {
    status: ran.status,
    stdout: ran.stdout || "",
    stderr: ran.stderr || "",
    json: parseJsonOutput(ran.stdout),
  };
}

test("pin constants match published 1.4.7", () => {
  assert.equal(USEFUL_JOBS_PIN.version, "1.4.7");
  assert.equal(
    USEFUL_JOBS_PIN.sha256,
    "e2e9b44e4d7318ac55052953318f05e53dbc121ab02e2762e34c919ac5469dec",
  );
  assert.equal(USEFUL_JOBS_PIN.bytes, 5255824);
  assert.equal(WRONG_SHA.length, 64);
  assert.equal(WRONG_BYTES, 5255823);
});

test("isInsideRepo detects checkout membership", () => {
  const r = defaultRoot();
  assert.equal(isInsideRepo(join(r, "package.json"), r), true);
  assert.equal(isInsideRepo("/tmp/outside-dest.tar.gz", r), false);
});

test("remapRefuse remaps product ok:false + child exit 0", () => {
  const mapped = remapRefuse({
    status: 0,
    stdout: JSON.stringify({
      ok: false,
      refused: true,
      code: "wrong-digest",
      message: "sha mismatch",
      extracted: false,
      destExists: false,
    }),
  }, { expectedCode: "wrong-digest", seeded: true });
  assert.equal(mapped.refused, true);
  assert.equal(mapped.remapped, true);
  assert.equal(mapped.productCode, "wrong-digest");
  assert.equal(mapped.matches, true);
});

test("cold acquire exit 0 JSON with sha+bytes+version", () => {
  const ran = runCli(["acquire", "--json", "--source", "kit"]);
  assert.equal(ran.status, 0, ran.stderr || ran.stdout);
  assert.equal(ran.json?.ok, true);
  assert.equal(ran.json?.result?.version, "1.4.7");
  assert.equal(ran.json?.result?.sha256, USEFUL_JOBS_PIN.sha256);
  assert.equal(ran.json?.result?.bytes, USEFUL_JOBS_PIN.bytes);
  assert.equal(ran.json?.result?.outsideRepo, true);
  assert.equal(ran.json?.boundary?.paymentSent, false);
  assert.equal(ran.json?.boundary?.catalogWritten, false);
  assert.equal(ran.json?.boundary?.publicWritten, false);
});

test("seeded wrong-sha exit ≠0 SEED_REJECT wrong-digest", () => {
  const ran = runCli(["--seeded-failure", "wrong-sha", "--json"]);
  assert.notEqual(ran.status, 0);
  assert.equal(ran.json?.ok, false);
  assert.equal(ran.json?.error?.code, "SEED_REJECT");
  assert.equal(ran.json?.result?.productCode, "wrong-digest");
  assert.equal(ran.json?.result?.remappedFromChildExit0, true);
  assert.equal(ran.json?.result?.childExit, 0);
});

test("seeded wrong-bytes exit ≠0 SEED_REJECT wrong-size", () => {
  const ran = runCli(["--seeded-failure", "wrong-bytes", "--json"]);
  assert.notEqual(ran.status, 0);
  assert.equal(ran.json?.ok, false);
  assert.equal(ran.json?.error?.code, "SEED_REJECT");
  assert.equal(ran.json?.result?.productCode, "wrong-size");
  assert.equal(ran.json?.result?.remappedFromChildExit0, true);
});

test("harness run exit 0 coldOk+seedsOk", () => {
  const ran = runCli(["run", "--json"]);
  assert.equal(ran.status, 0, ran.stderr || ran.stdout);
  assert.equal(ran.json?.ok, true);
  assert.equal(ran.json?.result?.coldOk, true);
  assert.equal(ran.json?.result?.seedsOk, true);
});
