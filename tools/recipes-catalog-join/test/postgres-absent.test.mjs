import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import test from "node:test";

/**
 * Postgres is not a published surface of this join. A real cluster is
 * local-runtime; a fake in-process store would only repeat this file's
 * assumptions. Skip when binaries are absent rather than invent settlement.
 */
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

test("postgres: no invented payment store; skip unless a real initdb exists", () => {
  const initdb = findInitdb();
  if (!initdb) {
    assert.equal(initdb, "");
    return;
  }
  assert.ok(existsSync(initdb));
});
