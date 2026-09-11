import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { parseStdout, runJoin } from "./helpers.mjs";

function findInitdb() {
  const candidates = [
    process.env.PULSE_PG_BIN && `${process.env.PULSE_PG_BIN}/initdb`,
    "/usr/lib/postgresql/17/bin/initdb",
    "/usr/lib/postgresql/16/bin/initdb",
    "/usr/bin/initdb",
  ].filter(Boolean);
  for (const path of candidates) {
    if (existsSync(path)) return path;
  }
  const located = spawnSync("sh", ["-c", "command -v initdb"], { encoding: "utf8" });
  return located.status === 0 ? located.stdout.trim() : "";
}

test("postgres is not a join surface: CLI does not claim a payment store or settlement", () => {
  const spawned = runJoin([]);
  assert.equal(spawned.status, 0, spawned.stderr);
  const report = parseStdout(spawned);
  assert.equal(report.outcome, "joined");
  assert.equal(report.paid, false);
  assert.equal(report.executionAuthorized, false);
  assert.equal(report.paymentRequiredFromRoutingIsPaid, false);
  assert.equal(Object.hasOwn(report, "postgres"), false);
  const initdb = findInitdb();
  if (initdb) {
    assert.equal(existsSync(initdb), true);
  }
});
